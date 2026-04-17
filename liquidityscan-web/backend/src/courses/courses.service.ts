import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateCourseDto, UpdateCourseDto, CreateChapterDto, CreateLessonDto, UpdateLessonDto } from './dto/create-course.dto';

type CourseAccessUser = {
    isAdmin: boolean;
    subscriptionId: string | null;
    subscriptionStatus: string;
    subscriptionExpiresAt: Date | null;
    tier: string;
};

@Injectable()
export class CoursesService {
    constructor(
        private prisma: PrismaService,
        private pricingService: PricingService,
    ) { }

    private subscriptionActive(u: CourseAccessUser): boolean {
        if (u.subscriptionStatus !== 'active') return false;
        if (!u.subscriptionExpiresAt) return true;
        return u.subscriptionExpiresAt > new Date();
    }

    /** Whether the viewer may see lesson/chapter streaming URLs for this chapter. */
    private async canViewChapterMedia(
        user: CourseAccessUser,
        course: { isFree: boolean; subscriptionId: string | null; price: unknown },
        chapter: { isFree: boolean; subscriptions?: { subscriptionId: string }[] },
    ): Promise<boolean> {
        if (user.isAdmin) return true;
        if (chapter.isFree) return true;
        if (course.isFree) return true;
        if (course.subscriptionId && user.subscriptionId === course.subscriptionId && this.subscriptionActive(user)) {
            return true;
        }
        const requiredPlans = (chapter.subscriptions ?? []).map((s) => s.subscriptionId);
        if (requiredPlans.length > 0 && user.subscriptionId && this.subscriptionActive(user) && requiredPlans.includes(user.subscriptionId)) {
            return true;
        }
        const price = Number(course.price);
        if (!course.subscriptionId && price > 0) {
            const paidPath = user.tier !== 'FREE' && this.subscriptionActive(user);
            const promoFreePath =
                user.tier === 'FREE' && (await this.pricingService.hasFullProductAccessForTier(user.tier));
            if (paidPath || promoFreePath) return true;
        }
        return false;
    }

    private async loadUserForCourseAccess(userId: string): Promise<CourseAccessUser> {
        const row = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                isAdmin: true,
                subscriptionId: true,
                subscriptionStatus: true,
                subscriptionExpiresAt: true,
                tier: true,
            },
        });
        if (!row) {
            throw new NotFoundException('User not found');
        }
        return row;
    }

    /** Strip video URLs unless the user is entitled (admin, free course/chapter, or matching subscription). */
    private async applyCourseMediaAccess(course: any, user: CourseAccessUser) {
        const chapters = await Promise.all(
            (course.chapters ?? []).map(async (ch: any) => {
                const allow = await this.canViewChapterMedia(user, course, ch);
                const { subscriptions: _sub, lessons, ...chapterRest } = ch;
                const maskedLessons = (lessons ?? []).map((lesson: any) => ({
                    ...lesson,
                    videoUrl: allow ? lesson.videoUrl : null,
                    videoProvider: allow ? lesson.videoProvider : null,
                    locked: !allow,
                }));
                return {
                    ...chapterRest,
                    videoUrl: allow ? ch.videoUrl : null,
                    lessons: maskedLessons,
                };
            }),
        );
        const { chapters: _c, ...courseRest } = course;
        return { ...courseRest, chapters };
    }

    /** Internal: full course payload for admins / service use. */
    async findOneRaw(id: string) {
        return this.prisma.course.findUnique({
            where: { id },
            include: {
                chapters: {
                    include: {
                        lessons: {
                            orderBy: {
                                order: 'asc',
                            },
                        },
                        subscriptions: {
                            include: {
                                subscription: true,
                            },
                        },
                    },
                    orderBy: {
                        order: 'asc',
                    },
                },
            },
        });
    }

    async create(data: CreateCourseDto) {
        // Clean up data: convert empty strings to null
        const cleanData: any = {
            title: data.title.trim(),
            description: data.description?.trim() || null,
            coverUrl: data.coverUrl?.trim() || null,
            difficulty: data.difficulty || 'Beginner',
            price: data.price ?? 0,
            subscriptionId: data.subscriptionId?.trim() || null,
        };

        const course = await this.prisma.course.create({
            data: cleanData,
        });

        // Auto-create one default chapter so admin can add lessons without creating a chapter first
        await this.prisma.chapter.create({
            data: {
                courseId: course.id,
                title: 'Lessons',
                order: 0,
                difficulty: 'Beginner',
                price: 0,
                isFree: true,
            },
        });

        return this.prisma.course.findUnique({
            where: { id: course.id },
            include: {
                chapters: {
                    include: { lessons: true },
                    orderBy: { order: 'asc' },
                },
            },
        });
    }

    async update(id: string, data: UpdateCourseDto) {
        const cleanData: any = {};
        if (data.title !== undefined) cleanData.title = data.title.trim();
        if (data.description !== undefined) cleanData.description = data.description?.trim() || null;
        if (data.coverUrl !== undefined) cleanData.coverUrl = data.coverUrl?.trim() || null;
        if (data.difficulty !== undefined) cleanData.difficulty = data.difficulty.trim();
        return this.prisma.course.update({
            where: { id },
            data: cleanData,
        });
    }

    /** Public catalog: metadata + chapter lesson counts only (no video URLs). */
    async findAllCatalog() {
        const courses = await this.prisma.course.findMany({
            orderBy: { title: 'asc' },
            include: {
                chapters: {
                    orderBy: { order: 'asc' },
                    select: {
                        id: true,
                        title: true,
                        order: true,
                        courseId: true,
                        _count: { select: { lessons: true } },
                    },
                },
            },
        });
        return courses.map((c) => ({
            ...c,
            chapters: c.chapters.map((ch) => {
                const { _count, ...rest } = ch;
                return { ...rest, lessonCount: _count.lessons };
            }),
        }));
    }

    /** Course detail for authenticated viewer (media URLs gated). */
    async findOneForViewer(userId: string, id: string) {
        const course = await this.findOneRaw(id);
        if (!course) return null;
        const user = await this.loadUserForCourseAccess(userId);
        if (user.isAdmin) {
            return course;
        }
        return await this.applyCourseMediaAccess(course, user);
    }

    private async getChaptersRaw(courseId: string) {
        return this.prisma.chapter.findMany({
            where: { courseId },
            include: {
                lessons: {
                    orderBy: {
                        order: 'asc',
                    },
                },
                subscriptions: {
                    include: {
                        subscription: true,
                    },
                },
            },
            orderBy: {
                order: 'asc',
            },
        });
    }

    /** Chapters list with the same media gating as findOneForViewer. */
    async getChaptersForViewer(userId: string, courseId: string) {
        const course = await this.prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true, isFree: true, subscriptionId: true, price: true },
        });
        if (!course) return null;
        const chapters = await this.getChaptersRaw(courseId);
        const user = await this.loadUserForCourseAccess(userId);
        if (user.isAdmin) {
            return chapters;
        }
        return Promise.all(
            chapters.map(async (ch) => {
                const allow = await this.canViewChapterMedia(user, course, ch as any);
                const { subscriptions: _sub, lessons, ...chapterRest } = ch as any;
                const maskedLessons = (lessons ?? []).map((lesson: any) => ({
                    ...lesson,
                    videoUrl: allow ? lesson.videoUrl : null,
                    videoProvider: allow ? lesson.videoProvider : null,
                    locked: !allow,
                }));
                return {
                    ...chapterRest,
                    videoUrl: allow ? ch.videoUrl : null,
                    lessons: maskedLessons,
                };
            }),
        );
    }

    async createChapter(courseId: string, data: CreateChapterDto) {
        // Clean up data: convert empty strings to null
        const cleanData: any = {
            courseId,
            title: data.title.trim(),
            description: data.description?.trim() || null,
            coverUrl: data.coverUrl?.trim() || null,
            videoUrl: data.videoUrl?.trim() || null,
            difficulty: data.difficulty || 'Beginner',
            price: data.price || 0,
            isFree: data.isFree !== undefined ? data.isFree : true,
            order: data.order || 0,
            subscriptions: data.subscriptionIds && data.subscriptionIds.length > 0
                ? {
                    create: data.subscriptionIds.map(subId => ({
                        subscriptionId: subId,
                    })),
                }
                : undefined,
        };
        
        return this.prisma.chapter.create({
            data: cleanData,
            include: {
                lessons: true,
                subscriptions: {
                    include: {
                        subscription: true,
                    },
                },
            },
        });
    }

    async updateChapter(id: string, data: Partial<CreateChapterDto>) {
        const cleanData: any = {};
        if (data.title !== undefined) cleanData.title = data.title.trim();
        if (data.description !== undefined) cleanData.description = data.description?.trim() || null;
        if (data.coverUrl !== undefined) cleanData.coverUrl = data.coverUrl?.trim() || null;
        if (data.videoUrl !== undefined) cleanData.videoUrl = data.videoUrl?.trim() || null;
        if (data.difficulty !== undefined) cleanData.difficulty = data.difficulty;
        if (data.price !== undefined) cleanData.price = data.price;
        if (data.isFree !== undefined) cleanData.isFree = data.isFree;
        if (data.order !== undefined) cleanData.order = data.order;
        
        // Handle subscription updates
        if (data.subscriptionIds !== undefined) {
            // Delete existing subscriptions
            await this.prisma.chapterSubscription.deleteMany({
                where: { chapterId: id },
            });
            
            // Create new subscriptions if provided
            if (data.subscriptionIds.length > 0) {
                cleanData.subscriptions = {
                    create: data.subscriptionIds.map(subId => ({
                        subscriptionId: subId,
                    })),
                };
            }
        }
        
        return this.prisma.chapter.update({
            where: { id },
            data: cleanData,
            include: {
                lessons: true,
                subscriptions: {
                    include: {
                        subscription: true,
                    },
                },
            },
        });
    }

    async deleteChapter(id: string) {
        return this.prisma.chapter.delete({ where: { id } });
    }

    async createLesson(chapterId: string, data: CreateLessonDto) {
        return this.prisma.lesson.create({
            data: {
                chapterId,
                title: data.title.trim(),
                description: data.description?.trim() || null,
                videoUrl: data.videoUrl.trim(),
                videoProvider: data.videoProvider?.trim() || null,
                coverUrl: data.coverUrl?.trim() || null,
                order: data.order ?? 0,
            },
        });
    }

    async updateLesson(id: string, data: UpdateLessonDto) {
        const cleanData: any = {};
        if (data.title !== undefined) cleanData.title = data.title.trim();
        if (data.description !== undefined) cleanData.description = data.description?.trim() || null;
        if (data.videoUrl !== undefined) cleanData.videoUrl = data.videoUrl.trim();
        if (data.videoProvider !== undefined) cleanData.videoProvider = data.videoProvider?.trim() || null;
        if (data.coverUrl !== undefined) cleanData.coverUrl = data.coverUrl?.trim() || null;
        if (data.order !== undefined) cleanData.order = data.order;
        return this.prisma.lesson.update({
            where: { id },
            data: cleanData,
        });
    }

    async delete(id: string) {
        return this.prisma.course.delete({ where: { id } });
    }

    async deleteLesson(id: string) {
        return this.prisma.lesson.delete({ where: { id } });
    }
}
