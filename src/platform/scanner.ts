import { fail } from '../shared/errors';
export async function decodePixels(data: ImageData): Promise<string> {
  const { default: jsQR } = await import('jsqr');
  const result = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
  if (!result) throw fail('validation', '未识别到二维码，请对准或重新选择图片');
  return result.data;
}
export async function decodeFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024)
    throw fail('validation', '请选择不超过 10 MiB 的本地二维码图片');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw fail('service-unavailable', '当前浏览器不支持图片识别');
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await decodePixels(context.getImageData(0, 0, canvas.width, canvas.height));
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function renderCredential(payload: string) {
  const QR = await import('qrcode');
  const svg = await QR.toString(payload, {
    type: 'svg',
    margin: 4,
    errorCorrectionLevel: 'M',
    width: 280,
  });
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}
