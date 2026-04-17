import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '../../services/userApi';
import { ArrowLeft, Plus, Pencil, Trash2, BookOpen } from 'lucide-react';

type VideoProvider = 'youtube' | 'wistia';

export function AdminCourseDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [lessonVideoUrl, setLessonVideoUrl] = useState('');
  const [lessonVideoProvider, setLessonVideoProvider] = useState<VideoProvider>('youtube');
  const COURSE_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'] as const;
  const [showEditCourse, setShowEditCourse] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [courseDescription, setCourseDescription] = useState('');
  const [courseCoverUrl, setCourseCoverUrl] = useState('');
  const [courseDifficulty, setCourseDifficulty] = useState<string>('Beginner');

  const { data: course, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => userApi.getCourse(id!),
    enabled: !!id,
  });

  const firstChapter = useMemo(() => course?.chapters?.[0], [course]);
  const lessons = useMemo(() => firstChapter?.lessons ?? [], [firstChapter]);

  const createLessonMutation = useMutation({
    mutationFn: (payload: { title: string; description?: string; videoUrl: string; videoProvider?: string; order: number }) =>
      userApi.createLesson(firstChapter!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course', id] });
      closeLessonModal();
    },
  });

  const updateLessonMutation = useMutation({
    mutationFn: (payload: { title?: string; description?: string; videoUrl?: string; videoProvider?: string }) =>
      userApi.updateLesson(editingLesson!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course', id] });
      closeLessonModal();
    },
  });

  const deleteLessonMutation = useMutation({
    mutationFn: (lessonId: string) => userApi.deleteLesson(lessonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course', id] });
      setDeleteConfirm(null);
    },
  });

  const updateCourseMutation = useMutation({
    mutationFn: (payload: { title: string; description?: string; coverUrl?: string; difficulty?: string }) =>
      userApi.updateCourse(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course', id] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      setShowEditCourse(false);
    },
  });

  const openEditCourse = () => {
    setCourseName(course?.title ?? '');
    setCourseDescription(course?.description ?? '');
    setCourseCoverUrl(course?.coverUrl ?? '');
    const d = course?.difficulty ?? 'Beginner';
    setCourseDifficulty(COURSE_DIFFICULTIES.includes(d as any) ? d : 'Beginner');
    setShowEditCourse(true);
  };

  const closeEditCourseModal = () => setShowEditCourse(false);

  const handleCourseSubmit = () => {
    if (!courseName.trim()) return;
    updateCourseMutation.mutate({
      title: courseName.trim(),
      description: courseDescription.trim() || undefined,
      coverUrl: courseCoverUrl.trim() || undefined,
      difficulty: courseDifficulty,
    });
  };

  const openAddLesson = () => {
    setEditingLesson(null);
    setLessonTitle('');
    setLessonDescription('');
    setLessonVideoUrl('');
    setLessonVideoProvider('youtube');
    setShowLessonModal(true);
  };

  const openEditLesson = (lesson: any) => {
    setEditingLesson(lesson);
    setLessonTitle(lesson.title ?? '');
    setLessonDescription(lesson.description ?? '');
    setLessonVideoUrl(lesson.videoUrl ?? '');
    setLessonVideoProvider((lesson.videoProvider === 'wistia' ? 'wistia' : 'youtube') as VideoProvider);
    setShowLessonModal(true);
  };

  const closeLessonModal = () => {
    setShowLessonModal(false);
    setEditingLesson(null);
    setLessonTitle('');
    setLessonDescription('');
    setLessonVideoUrl('');
    setLessonVideoProvider('youtube');
  };

  const handleLessonSubmit = () => {
    if (!lessonTitle.trim() || !lessonVideoUrl.trim()) return;
    if (editingLesson) {
      updateLessonMutation.mutate({
        title: lessonTitle.trim(),
        description: lessonDescription.trim() || undefined,
        videoUrl: lessonVideoUrl.trim(),
        videoProvider: lessonVideoProvider,
      });
    } else {
      createLessonMutation.mutate({
        title: lessonTitle.trim(),
        description: lessonDescription.trim() || undefined,
        videoUrl: lessonVideoUrl.trim(),
        videoProvider: lessonVideoProvider,
        order: lessons.length,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-16 dark:text-gray-500 light:text-slate-500">
        <p>Course not found</p>
        <Link to="/admin/courses" className="text-primary hover:underline mt-2 inline-block">
          Back to courses
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/admin/courses"
        className="inline-flex items-center gap-2 dark:text-gray-400 light:text-slate-500 hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to courses
      </Link>

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden mb-8 relative group">
        <div className="aspect-video max-h-48 w-full bg-black/40 flex items-center justify-center">
          {course.coverUrl ? (
            <img src={course.coverUrl} alt={course.title} className="w-full h-full object-cover" />
          ) : (
            <BookOpen className="w-16 h-16 dark:text-gray-600 light:text-slate-400" />
          )}
        </div>
        <div className="p-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-white">{course.title}</h1>
            {course.description && (
              <p className="dark:text-gray-400 light:text-slate-500 mt-2">{course.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={openEditCourse}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-white/20 dark:text-gray-300 light:text-slate-600 hover:bg-white/10 hover:text-white transition-colors"
            title="Edit course"
          >
            <Pencil className="w-4 h-4" />
            Edit course
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Lessons</h2>
        {firstChapter && (
          <button
            onClick={openAddLesson}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-black font-semibold hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            Add lesson
          </button>
        )}
      </div>

      {!firstChapter ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center dark:text-gray-500 light:text-slate-500">
          No chapters found. Edit this course in the database or create a chapter via API.
        </div>
      ) : lessons.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center dark:text-gray-500 light:text-slate-500">
          <p className="mb-4">No lessons yet</p>
          <button
            onClick={openAddLesson}
            className="text-primary hover:underline"
          >
            Add your first lesson
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="text-left py-3 px-4 dark:text-gray-400 light:text-slate-500 font-medium text-sm">Title</th>
                <th className="text-left py-3 px-4 dark:text-gray-400 light:text-slate-500 font-medium text-sm">Video link</th>
                <th className="w-24 py-3 px-4 text-right dark:text-gray-400 light:text-slate-500 font-medium text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson: any) => (
                <tr key={lesson.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 px-4 text-white font-medium">{lesson.title}</td>
                  <td className="py-3 px-4 dark:text-gray-400 light:text-slate-500 text-sm truncate max-w-xs">{lesson.videoUrl}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => openEditLesson(lesson)}
                      className="p-2 dark:text-gray-400 light:text-slate-500 hover:text-white rounded-lg hover:bg-white/10 mr-1"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(lesson.id)}
                      className="p-2 dark:text-gray-400 light:text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showLessonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingLesson ? 'Edit lesson' : 'Add lesson'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium dark:text-gray-300 light:text-slate-600 mb-1">Title</label>
                <input
                  type="text"
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  placeholder="Lesson title"
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium dark:text-gray-300 light:text-slate-600 mb-1">Description</label>
                <textarea
                  value={lessonDescription}
                  onChange={(e) => setLessonDescription(e.target.value)}
                  placeholder="Short description"
                  rows={3}
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium dark:text-gray-300 light:text-slate-600 mb-1">Video link</label>
                <input
                  type="url"
                  value={lessonVideoUrl}
                  onChange={(e) => setLessonVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/... or Wistia URL"
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium dark:text-gray-300 light:text-slate-600 mb-1">Video provider</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLessonVideoProvider('youtube')}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium ${
                      lessonVideoProvider === 'youtube'
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-white/10 dark:text-gray-400 light:text-slate-500 hover:bg-white/5'
                    }`}
                  >
                    YouTube
                  </button>
                  <button
                    type="button"
                    onClick={() => setLessonVideoProvider('wistia')}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium ${
                      lessonVideoProvider === 'wistia'
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-white/10 dark:text-gray-400 light:text-slate-500 hover:bg-white/5'
                    }`}
                  >
                    Wistia
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={closeLessonModal}
                className="flex-1 py-2 rounded-lg border border-white/20 dark:text-gray-300 light:text-slate-600 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleLessonSubmit}
                disabled={!lessonTitle.trim() || !lessonVideoUrl.trim() || createLessonMutation.isPending || updateLessonMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-primary text-black font-semibold disabled:opacity-50 hover:opacity-90"
              >
                {editingLesson
                  ? (updateLessonMutation.isPending ? 'Updating...' : 'Update')
                  : (createLessonMutation.isPending ? 'Creating...' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-4">Edit course</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium dark:text-gray-300 light:text-slate-600 mb-1">Name</label>
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="Course name"
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium dark:text-gray-300 light:text-slate-600 mb-1">Description</label>
                <textarea
                  value={courseDescription}
                  onChange={(e) => setCourseDescription(e.target.value)}
                  placeholder="Short description"
                  rows={3}
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium dark:text-gray-300 light:text-slate-600 mb-1">Difficulty</label>
                <select
                  value={courseDifficulty}
                  onChange={(e) => setCourseDifficulty(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {COURSE_DIFFICULTIES.map((d) => (
                    <option key={d} value={d} className="bg-[#1a1a1a] text-white">
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium dark:text-gray-300 light:text-slate-600 mb-1">Cover image URL</label>
                <input
                  type="url"
                  value={courseCoverUrl}
                  onChange={(e) => setCourseCoverUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={closeEditCourseModal}
                className="flex-1 py-2 rounded-lg border border-white/20 dark:text-gray-300 light:text-slate-600 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleCourseSubmit}
                disabled={!courseName.trim() || updateCourseMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-primary text-black font-semibold disabled:opacity-50 hover:opacity-90"
              >
                {updateCourseMutation.isPending ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-xl">
            <p className="text-white font-medium mb-4">Delete this lesson? This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 rounded-lg border border-white/20 dark:text-gray-300 light:text-slate-600 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteLessonMutation.mutate(deleteConfirm)}
                disabled={deleteLessonMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 font-semibold hover:bg-red-500/30 disabled:opacity-50"
              >
                {deleteLessonMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
