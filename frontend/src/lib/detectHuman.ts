/** Detect a likely human face / non-empty scene in a video frame */
export async function detectHumanInVideo(
  video: HTMLVideoElement,
): Promise<boolean> {
  try {
    const FD = (window as any).FaceDetector;
    if (typeof FD === 'function') {
      const detector = new FD({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(video);
      if (faces && faces.length > 0) return true;
    }
  } catch {
    // fall through
  }

  try {
    const canvas = document.createElement('canvas');
    const w = 160;
    const h = 120;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    let sumSq = 0;
    let skinish = 0;
    const n = w * h;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += gray;
      sumSq += gray * gray;
      if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
        skinish++;
      }
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    if (variance < 180) return false;
    if (skinish / n < 0.01 && variance < 800) return false;
    return true;
  } catch {
    return true;
  }
}
