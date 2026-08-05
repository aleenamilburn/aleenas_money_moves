function domainBuckets(state) {
  return Array.isArray(state?.domain?.buckets) ? state.domain.buckets : [];
}

function ordered(buckets) {
  return [...buckets].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

// The weekly-review primary action is intentionally parent-first. A child is
// never chosen implicitly: callers must display and confirm one when present.
export function reviewParentBuckets(state) {
  return ordered(domainBuckets(state).filter(bucket => !bucket.parentId && bucket.active !== false));
}

export function reviewChildrenForParent(state, parentId) {
  return ordered(domainBuckets(state).filter(bucket => bucket.parentId === parentId && bucket.active !== false));
}

export function reviewSuggestedParentId(state, selectedBucketId) {
  const selected = domainBuckets(state).find(bucket => bucket.id === selectedBucketId);
  return selected?.parentId || selected?.id || null;
}

export function reviewAssignmentTarget(state, parentId) {
  const parent = reviewParentBuckets(state).find(bucket => bucket.id === parentId) || null;
  return {parent, children:parent ? reviewChildrenForParent(state, parent.id) : []};
}
