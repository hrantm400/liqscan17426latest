/**
 * Utility functions for video URL handling
 */

export type VideoType = 'youtube' | 'vistia' | 'unknown';

/**
 * Determines the video type based on the URL
 * @param url - The video URL
 * @returns The video type ('youtube', 'vistia', or 'unknown')
 */
export const getVideoType = (url: string): VideoType => {
  if (!url) return 'unknown';
  const lowerUrl = url.toLowerCase();
  
  if (
    lowerUrl.includes('youtube.com') ||
    lowerUrl.includes('youtu.be') ||
    lowerUrl.includes('youtube-nocookie.com')
  ) {
    return 'youtube';
  }
  
  if (lowerUrl.includes('vistia.com')) {
    return 'vistia';
  }
  
  return 'unknown';
};

/**
 * Extracts the YouTube video ID from various YouTube URL formats
 * @param url - The YouTube URL
 * @returns The video ID or null if not found
 */
export const extractYouTubeVideoId = (url: string): string | null => {
  if (!url) return null;
  
  const patterns = [
    // Standard watch URL: https://www.youtube.com/watch?v=VIDEO_ID
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    // Watch URL with other params: https://www.youtube.com/watch?feature=...&v=VIDEO_ID
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    // Short URL: https://youtu.be/VIDEO_ID
    /youtu\.be\/([^?\n#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
};

/**
 * Validates if a URL is a valid video URL (YouTube or Vistia)
 * @param url - The URL to validate
 * @returns true if the URL is valid, false otherwise
 */
export const isValidVideoUrl = (url: string): boolean => {
  if (!url) return false;
  const videoType = getVideoType(url);
  
  if (videoType === 'youtube') {
    return extractYouTubeVideoId(url) !== null;
  }
  
  if (videoType === 'vistia') {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  return false;
};
