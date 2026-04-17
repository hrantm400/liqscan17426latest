import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { userApi } from '../../services/userApi';
import { Plus, BookOpen } from 'lucide-react';

export function CoursesManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const COURSE_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'] as const;
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [difficulty, setDifficulty] = useState<string>('Beginner');

  const { data: courses, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => userApi.getCourses(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { title: string; description?: string; coverUrl?: string; difficulty?: string }) =>
      userApi.createCourse(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      setShowAddModal(false);
      setName('');
      setDescription('');
      setCoverUrl('');
      setDifficulty('Beginner');
      if (created?.id) navigate(`/admin/courses/${created.id}`);
    },
  });

  const handleCreate = () => {
    if (!name.trim()) return;
    createMutation.mutate({
      title: name.trim(),
      description: description.trim() || undefined,
      coverUrl: coverUrl.trim() || undefined,
      difficulty: difficulty,
    });
  };

  const lessonCount = (course: any) =>
    (course?.chapters ?? []).reduce(
      (acc: number, ch: any) => acc + (ch.lessonCount ?? ch.lessons?.length ?? 0),
      0,
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Courses</h1>
          <p className="dark:text-gray-400 light:text-slate-500 text-sm mt-1">Manage courses and lessons</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-black font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-5 h-5" />
          Add course
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses?.map((course: any) => (
          <button
            key={course.id}
            type="button"
            onClick={() => navigate(`/admin/courses/${course.id}`)}
            className="text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 overflow-hidden transition-colors"
          >
            <div className="aspect-video w-full bg-black/40 overflow-hidden">
              {course.coverUrl ? (
                <img
                  src={course.coverUrl}
                  alt={course.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center dark:text-gray-500 light:text-slate-500">
                  <BookOpen className="w-12 h-12" />
                </div>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-white truncate">{course.title}</h3>
              <p className="text-sm dark:text-gray-400 light:text-slate-500 line-clamp-2 mt-1">{course.description}</p>
              <p className="text-xs dark:text-gray-500 light:text-slate-500 mt-2">{lessonCount(course)} lessons</p>
            </div>
          </button>
        ))}
      </div>

      {courses?.length === 0 && (
        <div className="text-center py-16 dark:text-gray-500 light:text-slate-500">
          <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No courses yet</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 text-primary hover:underline"
          >
            Add your first course
          </button>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-4">Create course</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium dark:text-gray-300 light:text-slate-600 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Course name"
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium dark:text-gray-300 light:text-slate-600 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description"
                  rows={3}
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium dark:text-gray-300 light:text-slate-600 mb-1">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
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
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 rounded-lg border border-white/20 dark:text-gray-300 light:text-slate-600 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || createMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-primary text-black font-semibold disabled:opacity-50 hover:opacity-90"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
