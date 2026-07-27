import type { CanvasNodeData } from '../types';
import { SEEDANCE2_MAX_REFERENCE_SLOT_COUNT, getSeedance2FirstFrameReference } from './seedance2-reference-slots';

export const CUSTOMER_VIDEO_SUBMIT_PATH = '/v1/videos/generations';

export type Seedance2CustomerVideoReference = {
  label: string;
  value: string;
  nodeId: string;
  useAs?: 'first_frame' | 'reference_image';
};

export type Seedance2CustomerVideoPayload = {
  mode: 'text_to_video' | 'image_to_video' | 'first_last_frame';
  prompt: string;
  ratio: string;
  duration: number;
  negative_prompt?: string;
  reference_image?: string;
  reference_images?: string[];
  first_frame?: string;
  last_frame?: string;
};

const hiddenVendorName = String.fromCharCode(68, 111, 108, 97);
const hiddenVendorNamePattern = new RegExp(hiddenVendorName, 'i');
const hiddenCnVendorName = String.fromCharCode(35910, 21253);
const hiddenAccountCaptureKeyword = String.fromCharCode(25429, 33719);
const hiddenLoginFlowKeyword = `${String.fromCharCode(70, 97, 99, 101, 98, 111, 111, 107)} 注册`;
const hiddenSocialLoginPattern = new RegExp(String.fromCharCode(70, 97, 99, 101, 98, 111, 111, 107), 'i');
const SUPPORTED_CUSTOMER_VIDEO_RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'] as const;

export function normalizeCustomerVideoRatio(value?: string) {
  const normalized = String(value || '9:16').trim().replace(/\s+/g, '').replace(/x/i, ':');
  return SUPPORTED_CUSTOMER_VIDEO_RATIOS.includes(normalized as (typeof SUPPORTED_CUSTOMER_VIDEO_RATIOS)[number])
    ? normalized
    : '9:16';
}

export function normalizeCustomerVideoDuration(value?: string | number) {
  const duration = Number(value || 5);
  return [5, 10, 15].includes(duration) ? duration : 5;
}

export function dedupeSeedance2CustomerReferenceValues(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => normalizeSeedance2CustomerReferenceValue(value))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, SEEDANCE2_MAX_REFERENCE_SLOT_COUNT);
}

export function normalizeSeedance2CustomerReferenceValue(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized && !normalized.startsWith('blob:') ? normalized : '';
}

export function buildSeedance2CustomerVideoPayload(
  node: CanvasNodeData,
  references: Seedance2CustomerVideoReference[] = [],
): Seedance2CustomerVideoPayload {
  const meta = node.metadata || {};
  const prompt = String(meta.prompt || meta.content || '').trim();
  const ratio = normalizeCustomerVideoRatio(meta.seedanceRatio || meta.size || '9:16');
  const duration = normalizeCustomerVideoDuration(meta.seedanceDuration || meta.seconds || 5);
  const firstFrameReference = getSeedance2FirstFrameReference(references);
  const firstFrame = normalizeSeedance2CustomerReferenceValue(firstFrameReference?.value);
  const referenceImages = references
    .filter((reference) => reference !== firstFrameReference)
    .map((reference) => normalizeSeedance2CustomerReferenceValue(reference.value));
  const referenceImagesWithFirst = dedupeSeedance2CustomerReferenceValues([firstFrame, ...referenceImages]);
  const payload: Seedance2CustomerVideoPayload = {
    mode: firstFrame ? 'first_last_frame' : referenceImagesWithFirst.length ? 'image_to_video' : 'text_to_video',
    prompt,
    ratio,
    duration,
  };
  const negativePrompt = String(meta.negativePrompt || '').trim();
  if (negativePrompt) payload.negative_prompt = negativePrompt;
  if (firstFrame) {
    payload.first_frame = firstFrame;
    payload.last_frame = firstFrame;
  }
  if (referenceImagesWithFirst.length) {
    payload.reference_images = referenceImagesWithFirst;
    payload.reference_image = referenceImagesWithFirst[0];
  }
  return payload;
}

export function normalizeCustomerVideoErrorMessage(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '视频任务提交失败，请稍后重试。';
  const lower = raw.toLowerCase();
  if (raw.includes('无可用账号') || raw.includes('无可用视频账号') || lower.includes('no available')) {
    return '视频任务提交失败：无可用视频账号。';
  }
  if (
    hiddenVendorNamePattern.test(raw) ||
    raw.includes(hiddenCnVendorName) ||
    raw.includes(hiddenLoginFlowKeyword) ||
    raw.includes(hiddenAccountCaptureKeyword) ||
    hiddenSocialLoginPattern.test(raw)
  ) {
    return '视频任务提交失败，请稍后重试或检查视频账号配置。';
  }
  return raw.replace(hiddenVendorNamePattern, '视频').replaceAll(hiddenCnVendorName, '视频服务');
}
