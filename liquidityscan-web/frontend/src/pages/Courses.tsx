import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

import { userApi } from '../services/userApi';

const heroContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

const heroItem = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
};

function useCourseProgress(courseId: string | undefined) {
  return useMemo(() => {
    if (!courseId || typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(`course-progress-${courseId}`);
      if (!saved) return [];
      return JSON.parse(saved) as string[];
    } catch {
      return [];
    }
  }, [courseId]);
}

function courseChapterCount(course: any) {
  return (course.chapters ?? []).length;
}

function chapterLessonCount(ch: any) {
  if (typeof ch.lessonCount === 'number') return ch.lessonCount;
  return (ch.lessons?.length ?? 0);
}

function CourseCard({ course, index }: { course: any; index: number }) {
  const completedIds = useCourseProgress(course.id);
  const totalLessons = useMemo(
    () =>
      (course.chapters ?? []).reduce(
        (acc: number, ch: any) => acc + chapterLessonCount(ch),
        0
      ),
    [course.chapters]
  );
  const completedCount = useMemo(() => completedIds.length, [completedIds.length]);
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const chapters = courseChapterCount(course);
  const difficulty = course.difficulty || 'Beginner';

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      <Link to={`/courses/${course.id}`} className="block h-full group/card">
        <motion.div
          whileHover={{ y: -6, scale: 1.02 }}
          transition={{ duration: 0.2 }}
          className="h-full rounded-3xl overflow-hidden border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-white/5 backdrop-blur-xl shadow-lg dark:shadow-none hover:shadow-xl dark:hover:shadow-[0_0_40px_-12px_rgba(19,236,55,0.15)] hover:border-slate-300 dark:hover:border-white/20 transition-all duration-300"
        >
          <div className="aspect-video w-full overflow-hidden bg-slate-100 dark:bg-black/40 relative">
            {course.coverUrl ? (
              <img
                src={course.coverUrl}
                alt={course.title}
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-110"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
                <span className="material-symbols-outlined text-6xl">school</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-white text-xs font-semibold uppercase tracking-wider">
                {difficulty}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/20 dark:bg-white/10 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">folder</span>
                {chapters} {chapters === 1 ? 'chapter' : 'chapters'}
              </span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
              <div className="h-2.5 rounded-full bg-white/25 dark:bg-white/15 overflow-hidden backdrop-blur-sm">
                <motion.div
                  className="h-full rounded-full bg-emerald-400 dark:bg-primary shadow-[0_0_14px_rgba(19,236,55,0.5)]"
                  initial={false}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <p className="text-[10px] text-white/90 mt-1.5 font-medium">
                {completedCount} of {totalLessons} lessons completed
              </p>
            </div>
          </div>
          <div className="p-5 dark:p-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white line-clamp-2 group-hover/card:text-emerald-600 dark:group-hover/card:text-primary transition-colors">
              {course.title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mt-2 leading-relaxed">
              {course.description || 'Step-by-step lessons to master the topic.'}
            </p>
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 dark:border-white/10">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">play_circle</span>
                {progressPercent === 100 ? 'All done' : `${totalLessons - completedCount} left`}
              </span>
              <span className="text-sm font-semibold text-emerald-600 dark:text-primary flex items-center gap-1.5">
                {progressPercent === 100 ? 'Review' : 'Continue'}
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </span>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="h-full rounded-3xl overflow-hidden border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-xl shadow-lg animate-pulse">
      <div className="aspect-video w-full bg-slate-200 dark:bg-white/10" />
      <div className="p-5 dark:p-6 space-y-3">
        <div className="h-6 rounded-lg bg-slate-200 dark:bg-white/10 w-3/4" />
        <div className="h-4 rounded bg-slate-200 dark:bg-white/10 w-full" />
        <div className="h-4 rounded bg-slate-200 dark:bg-white/10 w-2/3" />
        <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-white/10">
          <div className="h-4 rounded bg-slate-200 dark:bg-white/10 w-20" />
          <div className="h-4 rounded bg-slate-200 dark:bg-white/10 w-24" />
        </div>
      </div>
    </div>
  );
}

export function Courses() {
  const { data: courses, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => userApi.getCourses(),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-slate-50 dark:bg-[#060606]">
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div
            className="absolute inset-0 opacity-[0.4] dark:opacity-[0.08] bg-[length:64px_64px]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)
              `,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.04] via-transparent to-transparent dark:from-emerald-500/[0.05]" />
        </div>
        <div className="relative z-10 pt-24 pb-16 md:pt-28 md:pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-50 dark:bg-[#060606] pb-16">
      {/* Page-level background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.4] dark:opacity-[0.08] bg-[length:64px_64px]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)
            `,
          }}
        />
        <div
          className="absolute inset-0 opacity-0 dark:opacity-[0.05] bg-[length:64px_64px]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
            `,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.04] via-transparent to-transparent dark:from-emerald-500/[0.05]" />
      </div>

      <div className="relative z-10">
        {/* Breadcrumb */}
        <nav className="pt-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
          <ol className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <li><Link to="/dashboard" className="hover:text-emerald-600 dark:hover:text-primary transition-colors">Academy</Link></li>
            <li><span className="material-symbols-outlined text-sm">chevron_right</span></li>
            <li className="font-medium text-slate-700 dark:text-slate-300">Courses</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="pt-8 pb-14 md:pt-10 md:pb-16 px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={heroContainer}
            initial="hidden"
            animate="visible"
            className="max-w-3xl mx-auto text-center"
          >
            <motion.span
              variants={heroItem}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-medium tracking-wide mb-4"
            >
              <span className="material-symbols-outlined text-sm">auto_stories</span>
              Step-by-step
            </motion.span>
            <motion.h1
              variants={heroItem}
              className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight bg-gradient-to-r from-emerald-400 via-green-300 to-emerald-500 dark:from-emerald-400 dark:via-emerald-300 dark:to-emerald-500 bg-clip-text text-transparent"
            >
              Learning path
            </motion.h1>
            <motion.p
              variants={heroItem}
              className="text-slate-600 dark:text-slate-400 mt-4 max-w-xl mx-auto text-lg leading-relaxed"
            >
              Master the markets with step-by-step courses. Track your progress and pick up where you left off.
            </motion.p>
            {courses && courses.length > 0 && (
              <motion.p variants={heroItem} className="text-sm text-slate-500 dark:text-slate-500 mt-3">
                {courses.length} {courses.length === 1 ? 'course' : 'courses'} available
              </motion.p>
            )}
          </motion.div>
        </section>

        {/* Course cards grid */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {courses?.map((course: any, index: number) => (
              <CourseCard key={course.id} course={course} index={index} />
            ))}
          </motion.div>

          {courses?.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-3xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-xl shadow-lg py-20 px-8 text-center max-w-md mx-auto"
            >
              <span className="material-symbols-outlined text-7xl text-slate-400 dark:text-slate-500 mb-4 opacity-70">
                library_books
              </span>
              <p className="text-xl font-semibold text-slate-700 dark:text-slate-300">No courses yet</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Check back later for new content.</p>
              <Link
                to="/dashboard"
                className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 dark:bg-primary/10 text-emerald-600 dark:text-primary font-semibold text-sm hover:bg-emerald-500/20 dark:hover:bg-primary/20 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">home</span>
                Back to Dashboard
              </Link>
            </motion.div>
          )}
        </section>
      </div>
    </div>
  );
}
