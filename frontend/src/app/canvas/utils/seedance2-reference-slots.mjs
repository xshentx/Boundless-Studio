export const SEEDANCE2_MAX_REFERENCE_SLOT_COUNT = 12;

export const SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER = [
  'upstream_hd_frame',
  'current_shot',
  'character',
  'scene',
];

export const SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY = {
  upstream_hd_frame: '上游高清参考帧',
  current_shot: '当前分镜图',
  character: '角色图',
  scene: '场景图',
};

const SEEDANCE2_CUSTOMER_REFERENCE_SOURCE_RANK = {
  semantic: 0,
  connected: 1,
  extra: 2,
};

function normalizeSeedance2CustomerReferenceSource(source, fallback) {
  return source === 'semantic' || source === 'extra' || source === 'connected'
    ? source
    : fallback;
}

function safeSeedance2OrderIndex(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : fallback;
}

export function normalizeSeedance2ReferenceSlotUseAs(value) {
  return value === 'first_frame' ? 'first_frame' : 'reference_image';
}

export function buildSeedance2ReferenceSlotKeysFromOrder(referenceOrder) {
  const seenSlotKeys = new Set();
  const orderedSlotKeys = [];
  const labels = Array.isArray(referenceOrder) ? referenceOrder : [];
  labels.forEach((label) => {
    const key = SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER.find(
      (slotKey) => SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY[slotKey] === label,
    );
    if (!key || seenSlotKeys.has(key)) return;
    seenSlotKeys.add(key);
    orderedSlotKeys.push(key);
  });
  SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER.forEach((key) => {
    if (seenSlotKeys.has(key)) return;
    seenSlotKeys.add(key);
    orderedSlotKeys.push(key);
  });
  return orderedSlotKeys;
}

export function parseSeedance2ExtraReferenceSlotIndex(
  key,
  maxSlotCount = SEEDANCE2_MAX_REFERENCE_SLOT_COUNT,
) {
  const normalizedKey = String(key || '');
  const match = normalizedKey.match(/^reference_(\d+)$/);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10);
  const minExtraSlotIndex = SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER.length + 1;
  const safeMaxSlotCount = Number.isFinite(maxSlotCount)
    ? Math.max(0, Math.floor(maxSlotCount))
    : SEEDANCE2_MAX_REFERENCE_SLOT_COUNT;
  if (
    !Number.isSafeInteger(index) ||
    index < minExtraSlotIndex ||
    index > safeMaxSlotCount ||
    normalizedKey !== `reference_${index}`
  ) {
    return null;
  }
  return index;
}

export function seedance2BoundExtraSlotStats(extraBindings) {
  let boundSlotCount = 0;
  let highestSlotIndex = 0;
  Object.entries(extraBindings || {}).forEach(([key, binding]) => {
    if (!binding?.value && !binding?.nodeId) return;
    const index = parseSeedance2ExtraReferenceSlotIndex(key);
    if (index === null) return;
    boundSlotCount += 1;
    highestSlotIndex = Math.max(highestSlotIndex, index);
  });
  return { boundSlotCount, highestSlotIndex };
}

export function mergeSeedance2OrderedCustomerReferences(
  slotReferences = [],
  connectedReferences = [],
) {
  const candidates = [
    ...slotReferences.map((reference, index) => ({
      reference,
      source: normalizeSeedance2CustomerReferenceSource(
        reference.slotSource,
        'semantic',
      ),
      orderIndex: safeSeedance2OrderIndex(reference.slotOrderIndex, index),
      originalIndex: index,
    })),
    ...connectedReferences.map((reference, index) => ({
      reference,
      source: 'connected',
      orderIndex: safeSeedance2OrderIndex(reference.slotOrderIndex, index),
      originalIndex: slotReferences.length + index,
    })),
  ].sort(
    (left, right) =>
      SEEDANCE2_CUSTOMER_REFERENCE_SOURCE_RANK[left.source] -
        SEEDANCE2_CUSTOMER_REFERENCE_SOURCE_RANK[right.source] ||
      left.orderIndex - right.orderIndex ||
      left.originalIndex - right.originalIndex,
  );

  const seenNodeIds = new Set();
  const seenValues = new Set();
  const references = [];
  candidates.forEach(({ reference }) => {
    const nodeId = String(reference.nodeId || '').trim();
    const value = String(reference.value || '').trim();
    if (!value) return;
    if ((nodeId && seenNodeIds.has(nodeId)) || seenValues.has(value)) return;
    if (nodeId) seenNodeIds.add(nodeId);
    seenValues.add(value);
    const { slotSource, slotOrderIndex, ...publicReference } = reference;
    references.push(publicReference);
  });
  return references;
}

export function getSeedance2FirstFrameReference(references = []) {
  return references.find(
    (reference) => normalizeSeedance2ReferenceSlotUseAs(reference.useAs) === 'first_frame',
  );
}

function seedance2UsableReferenceValue(value) {
  const normalized = String(value || '').trim();
  return normalized && !normalized.startsWith('blob:') ? normalized : '';
}

function seedance2ManualReferenceValue(value) {
  return String(value || '').trim();
}

function seedance2ReferenceSequence(value) {
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : undefined;
}

function seedance2DirectImageConnections(placeholderId, nodes, connections) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const directConnections = [];
  connections.forEach((connection, originalIndex) => {
    if (connection.toNodeId !== placeholderId) return;
    const node = nodesById.get(connection.fromNodeId);
    if (!node || node.type !== 'image') return;
    if (!seedance2CanOccupyReferenceSlot(node)) return;
    directConnections.push({
      connection,
      node,
      originalIndex,
      referenceSequence: seedance2ReferenceSequence(connection.referenceSequence),
    });
  });
  return directConnections;
}

function seedance2ConnectionOrder(connection) {
  return connection.referenceSequence ?? connection.originalIndex + 1;
}

function seedance2OptionalNodeId(nodeId) {
  const normalized = String(nodeId || '').trim();
  return normalized || undefined;
}

function seedance2ManualReferences(placeholder) {
  const metadata = placeholder.metadata;
  const semanticBindings = metadata?.seedanceReferenceSlotBindings || {};
  const references = new Map();
  buildSeedance2ReferenceSlotKeysFromOrder(metadata?.seedanceReferenceOrder).forEach((key, index) => {
    const binding = semanticBindings[key];
    if (!binding) return;
    const value = seedance2ManualReferenceValue(binding.value);
    const nodeId = seedance2OptionalNodeId(binding.nodeId);
    if (!nodeId && !value) return;
    const slotIndex = index + 1;
    references.set(slotIndex, {
      slotIndex,
      label: String(binding?.label || SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY[key]).trim() || `参考图 ${slotIndex}`,
      value,
      nodeId,
      useAs: normalizeSeedance2ReferenceSlotUseAs(binding?.useAs),
    });
  });
  Object.entries(metadata?.seedanceReferenceExtraSlotBindings || {}).forEach(([key, binding]) => {
    const slotIndex = parseSeedance2ExtraReferenceSlotIndex(key);
    if (slotIndex === null || !binding) return;
    const value = seedance2ManualReferenceValue(binding.value);
    const nodeId = seedance2OptionalNodeId(binding.nodeId);
    if (!nodeId && !value) return;
    references.set(slotIndex, {
      slotIndex,
      label: String(binding?.label || `参考图 ${slotIndex}`).trim() || `参考图 ${slotIndex}`,
      value,
      nodeId,
      useAs: normalizeSeedance2ReferenceSlotUseAs(binding?.useAs),
    });
  });
  return [...references.values()];
}

function seedance2VisibleSlotCapacity(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function seedance2ConnectedImageValue(node) {
  const metadata = node.metadata;
  const localStorageKey = seedance2UsableReferenceValue(metadata?.storageKey);
  if (localStorageKey.startsWith('image:')) return localStorageKey;
  return [metadata?.backendUrl, metadata?.content, metadata?.backendRel, metadata?.storageKey]
    .map(seedance2UsableReferenceValue)
    .find(Boolean) || '';
}

function seedance2ConnectedImagePreviewValue(node) {
  const metadata = node.metadata;
  return [metadata?.backendUrl, metadata?.content, metadata?.backendRel]
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
}

function seedance2PendingImageReference(node) {
  const metadata = node?.metadata || {};
  const status = String(metadata.status || '').trim();
  return status === 'loading' || status === 'generating' || Boolean(metadata.sourceImageTaskId);
}

export function seedance2CanOccupyReferenceSlot(node) {
  if (!node || node.type !== 'image') return false;
  return Boolean(seedance2ConnectedImageValue(node) || seedance2ConnectedImagePreviewValue(node) || seedance2PendingImageReference(node));
}

function seedance2IsUpstreamHdFrame(node) {
  const metadata = node.metadata;
  if (
    metadata?.seedanceReferenceSlot === 'upstream_hd_frame' ||
    metadata?.source === 'seedance2-frame-extraction'
  ) return true;
  const text = `${node.title || ''}\n${metadata?.storyLabel || ''}\n${metadata?.source || ''}`.toLowerCase();
  return /\u4e0a\u6e38|\u9ad8\u6e05\u53c2\u8003|\u53c2\u8003\u5e27|\u4e0a\u4e00|\u524d\u4e00|previous|upstream/.test(text);
}

function seedance2ConnectedImageUseAs(node) {
  return seedance2IsUpstreamHdFrame(node) ? 'first_frame' : 'reference_image';
}

export function nextSeedance2ReferenceSequence(placeholderId, nodes, connections) {
  return seedance2DirectImageConnections(placeholderId, nodes, connections).reduce(
    (nextSequence, connection) => Math.max(nextSequence, seedance2ConnectionOrder(connection) + 1),
    1,
  );
}

export function seedance2ManualReferenceHighestSlotIndex(placeholder) {
  return seedance2ManualReferences(placeholder).reduce(
    (highestSlotIndex, reference) => Math.max(highestSlotIndex, reference.slotIndex),
    0,
  );
}

export function planSeedance2ReferenceConnection({
  connection,
  placeholderId,
  nodes,
  connections,
  visibleSlotCount,
}) {
  const source = nodes.find((node) => node.id === connection.fromNodeId);
  const placeholder = nodes.find((node) => node.id === placeholderId);
  if (
    connection.toNodeId !== placeholderId ||
    source?.type !== 'image' ||
    !placeholder
  ) {
    return { accepted: true, referenceSequence: 0 };
  }

  const slots = resolveSeedance2ReferenceSlots({
    placeholder,
    nodes,
    connections,
    visibleSlotCount,
  });
  if (!slots.some((slot) => slot.source === 'empty')) {
    return { accepted: false, reason: 'full' };
  }
  return {
    accepted: true,
    referenceSequence: nextSeedance2ReferenceSequence(
      placeholderId,
      nodes,
      connections,
    ),
  };
}

export function resolveSeedance2ReferenceSlots({
  placeholder,
  nodes,
  connections,
  visibleSlotCount,
}) {
  const manualReferences = seedance2ManualReferences(placeholder);
  const directConnections = seedance2DirectImageConnections(placeholder.id, nodes, connections)
    .sort((left, right) => (
      seedance2ConnectionOrder(left) - seedance2ConnectionOrder(right) ||
      left.originalIndex - right.originalIndex
    ));
  const highestManualSlotIndex = manualReferences.reduce(
    (highestSlotIndex, reference) => Math.max(highestSlotIndex, reference.slotIndex),
    0,
  );
  const capacity = Math.min(
    SEEDANCE2_MAX_REFERENCE_SLOT_COUNT,
    Math.max(
      seedance2VisibleSlotCapacity(visibleSlotCount),
      highestManualSlotIndex,
      manualReferences.length + directConnections.length,
    ),
  );
  const slots = Array.from({ length: capacity }, (_, index) => ({
    slotIndex: index + 1,
    source: 'empty',
    label: `参考图 ${index + 1}`,
    value: '',
    useAs: 'reference_image',
  }));

  manualReferences.forEach((reference) => {
    const slot = slots[reference.slotIndex - 1];
    if (!slot) return;
    slots[reference.slotIndex - 1] = { ...slot, ...reference, source: 'manual' };
  });
  directConnections.forEach((directConnection) => {
    const nextSlotIndex = slots.findIndex((slot) => slot.source === 'empty');
    if (nextSlotIndex === -1) return;
    const value = seedance2ConnectedImageValue(directConnection.node);
    const isStoryCurrentShot = directConnection.node.id === placeholder.metadata?.seedanceStorySourceImageNodeId;
    slots[nextSlotIndex] = {
      slotIndex: nextSlotIndex + 1,
      source: value ? 'connected' : 'pending',
      label: isStoryCurrentShot
        ? SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY.current_shot
        : String(directConnection.node.title || `参考图 ${nextSlotIndex + 1}`).trim() || `参考图 ${nextSlotIndex + 1}`,
      value,
      previewValue: seedance2ConnectedImagePreviewValue(directConnection.node),
      nodeId: directConnection.node.id,
      connectionId: directConnection.connection.id,
      referenceSequence: directConnection.referenceSequence,
      useAs: seedance2ConnectedImageUseAs(directConnection.node),
    };
  });
  return slots;
}

export function seedance2ResolvedSlotsToCustomerReferences(slots) {
  return [...slots]
    .sort((left, right) => left.slotIndex - right.slotIndex)
    .flatMap((slot) => {
      const value = seedance2UsableReferenceValue(slot.value);
      if ((slot.source !== 'manual' && slot.source !== 'connected') || !value) return [];
      return [{
        label: String(slot.label || `参考图 ${slot.slotIndex}`).trim() || `参考图 ${slot.slotIndex}`,
        value,
        nodeId: seedance2OptionalNodeId(slot.nodeId) || `seedance2-reference-slot-${slot.slotIndex}`,
        useAs: normalizeSeedance2ReferenceSlotUseAs(slot.useAs),
      }];
    });
}
