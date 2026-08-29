export function createActiveProgressReporter(startId, getActiveStartId, showProgress) {
  return (loaded, total) => {
    if (startId === getActiveStartId()) showProgress(loaded / total);
  };
}
