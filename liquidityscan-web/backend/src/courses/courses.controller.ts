import { Controller, Get, Post, Put, Body, Param, Delete, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto, CreateChapterDto, CreateLessonDto, UpdateLessonDto } from './dto/create-course.dto';
import { AdminGuard } from '../admin/guards/admin.guard';
import { Public } from '../auth/decorators/public.decorator';

@Controller('courses')
export class CoursesController {
    constructor(private readonly coursesService: CoursesService) { }

    @Post()
    @UseGuards(AdminGuard)
    create(@Body() createCourseDto: CreateCourseDto) {
        return this.coursesService.create(createCourseDto);
    }

    @Get()
    @Public()
    findAll() {
        return this.coursesService.findAllCatalog();
    }

    @Put(':id')
    @UseGuards(AdminGuard)
    update(@Param('id') id: string, @Body() updateCourseDto: UpdateCourseDto) {
        return this.coursesService.update(id, updateCourseDto);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Req() req: { user: { userId: string } }) {
        const course = await this.coursesService.findOneForViewer(req.user.userId, id);
        if (!course) {
            throw new NotFoundException(`Course ${id} not found`);
        }
        return course;
    }

    @Get(':courseId/chapters')
    async getChapters(@Param('courseId') courseId: string, @Req() req: { user: { userId: string } }) {
        const rows = await this.coursesService.getChaptersForViewer(req.user.userId, courseId);
        if (rows === null) {
            throw new NotFoundException(`Course ${courseId} not found`);
        }
        return rows;
    }

    @Post(':courseId/chapters')
    @UseGuards(AdminGuard)
    createChapter(@Param('courseId') courseId: string, @Body() createChapterDto: CreateChapterDto) {
        return this.coursesService.createChapter(courseId, createChapterDto);
    }

    @Put('chapters/:id')
    @UseGuards(AdminGuard)
    updateChapter(@Param('id') id: string, @Body() updateChapterDto: Partial<CreateChapterDto>) {
        return this.coursesService.updateChapter(id, updateChapterDto);
    }

    @Delete('chapters/:id')
    @UseGuards(AdminGuard)
    deleteChapter(@Param('id') id: string) {
        return this.coursesService.deleteChapter(id);
    }

    @Post('chapters/:chapterId/lessons')
    @UseGuards(AdminGuard)
    createLesson(@Param('chapterId') chapterId: string, @Body() createLessonDto: CreateLessonDto) {
        return this.coursesService.createLesson(chapterId, createLessonDto);
    }

    @Put('lessons/:id')
    @UseGuards(AdminGuard)
    updateLesson(@Param('id') id: string, @Body() updateLessonDto: UpdateLessonDto) {
        return this.coursesService.updateLesson(id, updateLessonDto);
    }

    @Delete('lessons/:id')
    @UseGuards(AdminGuard)
    deleteLesson(@Param('id') id: string) {
        return this.coursesService.deleteLesson(id);
    }

    @Delete(':id')
    @UseGuards(AdminGuard)
    delete(@Param('id') id: string) {
        return this.coursesService.delete(id);
    }
}
