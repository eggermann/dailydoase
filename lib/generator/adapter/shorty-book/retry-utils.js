export const isGpuAbort = (error) => {
  try {
    if (!error) return false;
    const parts = [];

    if (typeof error === 'string') parts.push(error);
    if (error.message) parts.push(String(error.message));
    if (error.title) parts.push(String(error.title));
    if (error.stage) parts.push(String(error.stage));
    if (error.message || error.title || error.stage) {
      if (error.success === false) parts.push('success:false');
    }
    if (error.response && error.response.data) {
      const body = Buffer.isBuffer(error.response.data)
        ? Buffer.from(error.response.data).toString('utf-8')
        : String(error.response.data);
      parts.push(body);
    }
    const haystack = parts.join(' | ').toLowerCase();
    return haystack.includes('gpu task aborted') || haystack.includes('zerogpu worker error');
  } catch {
    return false;
  }
};
