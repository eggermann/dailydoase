export function terminalVideoFailure(record) {
  return (record.videoResults || []).find((video) => video?.errorCode === 'VIDEO_PROVIDER_TERMINAL_ERROR') || null;
}
