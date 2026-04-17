import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { userApi } from '../services/userApi';

const videoWrapperClass =
  'aspect-video w-full bg-black rounded-2xl overflow-hidden shadow-xl ring-1 ring-slate-200/50 dark:ring-white/10 relative';

function VideoPlayer({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className={`${videoWrapperClass} flex flex-col items-center justify-center gap-3 bg-slate-900 text-center px-6`}>
        <span className="material-symbols-outlined text-4xl text-slate-500">lock</span>
        <p className="text-slate-300 text-sm max-w-md">
          This lesson is available with a subscription. Upgrade to unlock full video access.
        </p>
        <Link
          to="/subscriptions"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors"
        >
          View plans
        </Link>
      </div>
    );
  }

  let embedUrl = url;
  let isWistia = false;

  if (url.includes('youtube.com/watch?v=')) {
    const videoId = url.split('v=')[1]?.split('&')[0];
    embedUrl = `https://www.youtube.com/embed/${videoId}`;
  } else if (url.includes('youtu.be/')) {
    const videoId = url.split('youtu.be/')[1]?.split('?')[0];
    embedUrl = `https://www.youtube.com/embed/${videoId}`;
  } else if (url.includes('youtube.com/embed/')) {
    embedUrl = url;
  } else if (url.includes('wistia.com') || url.includes('wistia.net')) {
    isWistia = true;
    let wistiaId = '';
    if (url.includes('/medias/')) {
      wistiaId = url.split('/medias/')[1]?.split('?')[0] || url.split('/medias/')[1]?.split('/')[0];
    } else if (url.includes('wistia.net/embed/')) {
      wistiaId = url.split('wistia.net/embed/')[1]?.split('?')[0];
    } else if (url.includes('wistia.com/medias/')) {
      wistiaId = url.split('wistia.com/medias/')[1]?.split('?')[0];
    }
    if (wistiaId) {
      embedUrl = `https://fast.wistia.net/embed/iframe/${wistiaId}`;
    }
  }

  return (
    <div className={videoWrapperClass}>
      <iframe
        src={embedUrl}
        className="w-full h-full"
        title="Video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

export function CourseDetail() {
  const { id } = useParams();
  const { data: course, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => userApi.getCourse(id!),
    enabled: !!id,
  });

  const [activeLesson, setActiveLesson] = useState<any>(null);
  const [activeChapter, setActiveChapter] = useState<any>(null);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem(`course-progress-${id}`);
    if (saved) {
      try {
        setCompletedLessons(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error('Failed to load progress:', e);
      }
    }
  }, [id]);

  const markLessonComplete = (lessonId: string) => {
    const newCompleted = new Set(completedLessons);
    newCompleted.add(lessonId);
    setCompletedLessons(newCompleted);
    localStorage.setItem(`course-progress-${id}`, JSON.stringify(Array.from(newCompleted)));
  };

  useEffect(() => {
    if (!course?.chapters?.length || activeLesson) return;
    const flat = course.chapters.flatMap((ch: any) =>
      (ch.lessons ?? []).map((l: any) => ({ ...l, chapter: ch })),
    );
    const firstPlayable = flat.find((l: any) => l.videoUrl);
    const pick = firstPlayable ?? flat[0];
    if (pick) {
      setActiveChapter(pick.chapter);
      setActiveLesson(pick);
    }
  }, [course, activeLesson]);

  const totalLessons = course?.chapters?.reduce((acc: number, ch: any) => acc + (ch.lessons?.length || 0), 0) || 0;
  const completedCount = completedLessons.size;
  const progress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const allLessons = useMemo(() => {
    if (!course?.chapters) return [];
    return course.chapters.flatMap((ch: any) => (ch.lessons ?? []).map((l: any) => ({ ...l, chapter: ch })));
  }, [course]);

  const currentLessonIndex = activeLesson ? allLessons.findIndex((l: any) => l.id === activeLesson.id) : -1;
  const prevLesson = currentLessonIndex > 0 ? allLessons[currentLessonIndex - 1] : null;
  const nextLesson = currentLessonIndex >= 0 && currentLessonIndex < allLessons.length - 1 ? allLessons[currentLessonIndex + 1] : null;

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
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-500 border-t-transparent dark:border-primary dark:border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!course) {
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
        <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
          <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-white/5 backdrop-blur-xl shadow-lg p-8 text-center max-w-md">
            <p className="text-slate-600 dark:text-slate-400 font-medium">Course not found</p>
            <Link
              to="/courses"
              className="mt-4 inline-flex items-center gap-2 text-emerald-600 dark:text-primary font-semibold hover:underline"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              Back to courses
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12 flex flex-col relative overflow-hidden bg-slate-50 dark:bg-[#060606]">
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

      {/* Breadcrumb */}
      <nav className="relative z-20 pt-4 px-4 sm:px-6 max-w-[1800px] mx-auto">
        <ol className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <li>
            <Link to="/courses" className="hover:text-emerald-600 dark:hover:text-primary transition-colors flex items-center gap-1">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Courses
            </Link>
          </li>
          <li><span className="material-symbols-outlined text-sm">chevron_right</span></li>
          <li className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px] sm:max-w-none" title={course.title}>
            {course.title}
          </li>
        </ol>
      </nav>

      {/* Sticky header - glass */}
      <header className="sticky top-0 z-20 mt-2 px-4 sm:px-6 py-4 border-b border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-xl">
        <div className="max-w-[1800px] mx-auto flex items-center gap-4">
          <Link
            to="/courses"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0"
            title="Back to all courses"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="text-sm font-medium hidden sm:inline">Back to courses</span>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight truncate">
              {course.title}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-gray-400 flex-wrap">
              <span className="bg-emerald-500/10 dark:bg-primary/10 text-emerald-600 dark:text-primary px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
                {course.difficulty || 'Beginner'}
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">folder</span>
                {course.chapters?.length || 0} Chapters
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">ondemand_video</span>
                {totalLessons} Lessons
              </span>
              {completedCount > 0 && (
                <>
                  <span>·</span>
                  <span className="text-emerald-600 dark:text-primary font-medium">{completedCount} completed</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex-1 max-w-[1800px] mx-auto w-full p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 flex flex-col gap-6 lg:gap-8">
          {activeLesson ? (
            <motion.div
              key={activeLesson.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-6"
            >
              <div className="flex items-center justify-between gap-4 mb-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Lesson {currentLessonIndex + 1} of {totalLessons}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">ondemand_video</span>
                  Video lesson
                </span>
              </div>
              <VideoPlayer url={activeLesson.videoUrl} />

              <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-white/5 backdrop-blur-xl shadow-lg p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">
                    {activeLesson.title}
                  </h2>
                  <button
                    onClick={() => markLessonComplete(activeLesson.id)}
                    title={completedLessons.has(activeLesson.id) ? 'Completed' : 'Mark this lesson as completed'}
                    className={
                      completedLessons.has(activeLesson.id)
                        ? 'px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500/20 dark:bg-primary/20 text-emerald-600 dark:text-primary border border-emerald-500/40 dark:border-primary/40 shadow-[0_0_12px_rgba(19,236,55,0.3)] flex items-center gap-2 shrink-0'
                        : 'px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-400 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/15 transition-colors flex items-center gap-2 shrink-0'
                    }
                  >
                    {completedLessons.has(activeLesson.id) ? (
                      <><span className="material-symbols-outlined text-lg">check_circle</span> Completed</>
                    ) : (
                      <><span className="material-symbols-outlined text-lg">radio_button_unchecked</span> Mark Complete</>
                    )}
                  </button>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {activeLesson.description || 'No description.'}
                </p>

                {/* Prev / Next */}
                <div className="flex items-center justify-between gap-4 mt-6 pt-6 border-t border-slate-200/80 dark:border-white/10">
                  {prevLesson ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLesson(prevLesson);
                        setActiveChapter(prevLesson.chapter);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-gray-300 font-medium text-sm hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">arrow_back</span>
                      <span className="truncate max-w-[140px] sm:max-w-[200px]">{prevLesson.title}</span>
                    </button>
                  ) : (
                    <div />
                  )}
                  {nextLesson ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLesson(nextLesson);
                        setActiveChapter(nextLesson.chapter);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 dark:bg-primary/10 text-emerald-700 dark:text-primary font-semibold text-sm hover:bg-emerald-500/20 dark:hover:bg-primary/20 transition-colors border border-emerald-500/20 dark:border-primary/20"
                    >
                      <span className="truncate max-w-[140px] sm:max-w-[200px]">{nextLesson.title}</span>
                      <span className="material-symbols-outlined text-lg">arrow_forward</span>
                    </button>
                  ) : (
                    <div />
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="aspect-video rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-center">
              <div className="text-center text-slate-500 dark:text-slate-400 px-6 max-w-sm">
                <span className="material-symbols-outlined text-5xl mb-3 block opacity-70">play_lesson</span>
                <p className="font-medium text-slate-700 dark:text-slate-300">Select a lesson to start</p>
                <p className="text-sm mt-1">Choose a lesson from the list on the right to watch the video and read the notes.</p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Course Content */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-white/5 backdrop-blur-xl shadow-lg overflow-hidden flex flex-col h-[calc(100vh-140px)] lg:h-[calc(100vh-120px)] sticky top-24">
            <div className="p-4 border-b border-slate-200/80 dark:border-white/10 bg-white/50 dark:bg-white/5">
              <h3 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">list_alt</span>
                Course Content
              </h3>
              {completedCount > 0 && (
                <p className="text-xs text-emerald-600 dark:text-primary font-medium mb-2">Resume from where you left off</p>
              )}
              <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-emerald-500 dark:bg-primary shadow-[0_0_12px_rgba(19,236,55,0.4)]"
                  initial={false}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-2">
                {progress}% Complete · {completedCount}/{totalLessons} lessons
              </p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
              {course.chapters?.map((chapter: any) => {
                const isChapterExpanded =
                  activeChapter?.id === chapter.id ||
                  chapter.lessons?.some((l: any) => l.id === activeLesson?.id);
                return (
                  <div
                    key={chapter.id}
                    className="rounded-lg border border-slate-200/80 dark:border-white/10 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setActiveChapter(
                          isChapterExpanded && activeChapter?.id === chapter.id ? null : chapter
                        )
                      }
                      className="w-full flex items-center gap-2 p-3 text-left rounded-lg bg-slate-50/50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg text-slate-500 dark:text-gray-400 shrink-0">
                        {isChapterExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {chapter.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-gray-400">
                          {chapter.lessons?.length || 0} lessons
                        </p>
                      </div>
                    </button>

                    {isChapterExpanded && (
                      <div className="space-y-1 p-2 bg-white/30 dark:bg-white/[0.02]">
                        {chapter.lessons?.map((lesson: any, lessonIndex: number) => {
                          const isActive = activeLesson?.id === lesson.id;
                          const isCompleted = completedLessons.has(lesson.id);
                          return (
                            <button
                              type="button"
                              key={lesson.id}
                              onClick={() => {
                                setActiveLesson(lesson);
                                setActiveChapter(chapter);
                              }}
                              className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all duration-200 ${
                                isActive
                                  ? 'bg-emerald-500/10 dark:bg-primary/10 ring-1 ring-emerald-500/30 dark:ring-primary/30'
                                  : 'hover:bg-slate-100 dark:hover:bg-white/10 border border-transparent'
                              }`}
                            >
                              <div
                                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                                  isActive
                                    ? 'bg-emerald-500 dark:bg-primary text-white dark:text-black'
                                    : isCompleted
                                      ? 'bg-emerald-500/20 dark:bg-primary/20 text-emerald-600 dark:text-primary'
                                      : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-gray-400'
                                }`}
                              >
                                {isCompleted ? '✓' : lessonIndex + 1}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4
                                  className={`text-sm font-medium leading-tight truncate ${
                                    isActive
                                      ? 'text-emerald-700 dark:text-primary'
                                      : 'text-slate-700 dark:text-gray-300'
                                  }`}
                                >
                                  {lesson.title}
                                </h4>
                                <span className="text-[10px] text-slate-500 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                                  <span className="material-symbols-outlined text-xs">ondemand_video</span>
                                  Video
                                </span>
                              </div>
                              {isActive && (
                                <span className="material-symbols-outlined text-emerald-500 dark:text-primary text-lg shrink-0">
                                  equalizer
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
