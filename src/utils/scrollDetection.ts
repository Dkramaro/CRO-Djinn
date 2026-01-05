/**
 * Scroll Container Detection Utility
 * 
 * Detects the main scrollable container on pages that use custom scroll containers
 * instead of the default window/document scroll. This handles modern SPA patterns
 * where body has overflow:hidden and a child element handles scrolling.
 * 
 * Key differentiators to avoid confusing component scrollers (chat widgets, code blocks, etc.):
 * - Minimum viewport coverage (60% width, 50% height)
 * - DOM depth (main scroller is usually shallow)
 * - Contains primary content markers (h1, main, etc.)
 * - Not inside modals/overlays
 * - Sufficient scroll capacity (scrollHeight > 1000px)
 */

export interface ScrollContainerInfo {
  /** The detected scroll container element, or null if window should be used */
  element: Element | null;
  /** Whether a custom container was detected (false = use window) */
  isCustomContainer: boolean;
  /** Total scrollable height */
  scrollHeight: number;
  /** Current scroll position */
  scrollTop: number;
  /** Visible height of the container */
  clientHeight: number;
  /** Debug info about detection */
  debug?: {
    reason: string;
    candidatesFound: number;
    windowScrollable: boolean;
  };
}

interface ScrollCandidate {
  element: Element;
  score: number;
  scrollHeight: number;
  clientHeight: number;
  rect: DOMRect;
  domDepth: number;
  containsMainContent: boolean;
  isInsideOverlay: boolean;
}

/**
 * Detects the main scroll container for the page.
 * Returns info about the container and whether to use it vs window scroll.
 */
export function detectMainScrollContainer(): ScrollContainerInfo {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // First, check if window scrolling works normally
  const windowScrollable = isWindowScrollable();
  
  if (windowScrollable) {
    // Window scroll works - use it (most common case)
    return {
      element: null,
      isCustomContainer: false,
      scrollHeight: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      ),
      scrollTop: window.pageYOffset || document.documentElement.scrollTop,
      clientHeight: viewportHeight,
      debug: {
        reason: 'Window scroll is functional',
        candidatesFound: 0,
        windowScrollable: true
      }
    };
  }
  
  // Window scroll is blocked - find the custom scroll container
  const candidates = findScrollCandidates(viewportWidth, viewportHeight);
  
  if (candidates.length === 0) {
    // No candidates found - fall back to window even though it might not work well
    return {
      element: null,
      isCustomContainer: false,
      scrollHeight: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      ),
      scrollTop: window.pageYOffset || document.documentElement.scrollTop,
      clientHeight: viewportHeight,
      debug: {
        reason: 'No valid scroll container candidates found, falling back to window',
        candidatesFound: 0,
        windowScrollable: false
      }
    };
  }
  
  // Score and rank candidates
  const scoredCandidates = candidates
    .map(candidate => ({
      ...candidate,
      score: scoreCandidate(candidate, viewportWidth, viewportHeight)
    }))
    .sort((a, b) => b.score - a.score);
  
  const best = scoredCandidates[0];
  
  // Only use custom container if it scores well enough
  if (best.score < 50) {
    return {
      element: null,
      isCustomContainer: false,
      scrollHeight: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      ),
      scrollTop: window.pageYOffset || document.documentElement.scrollTop,
      clientHeight: viewportHeight,
      debug: {
        reason: `Best candidate score (${best.score}) below threshold`,
        candidatesFound: candidates.length,
        windowScrollable: false
      }
    };
  }
  
  return {
    element: best.element,
    isCustomContainer: true,
    scrollHeight: best.scrollHeight,
    scrollTop: best.element.scrollTop,
    clientHeight: best.clientHeight,
    debug: {
      reason: `Found custom scroll container with score ${best.score}`,
      candidatesFound: candidates.length,
      windowScrollable: false
    }
  };
}

/**
 * Check if window/document scrolling works normally
 */
function isWindowScrollable(): boolean {
  const html = document.documentElement;
  const body = document.body;
  
  // Check computed styles for overflow blocking
  const htmlStyle = window.getComputedStyle(html);
  const bodyStyle = window.getComputedStyle(body);
  
  const htmlOverflow = htmlStyle.overflowY;
  const bodyOverflow = bodyStyle.overflowY;
  
  // If both html and body have overflow hidden, window scroll is blocked
  const htmlBlocked = htmlOverflow === 'hidden';
  const bodyBlocked = bodyOverflow === 'hidden';
  
  // Check if there's actually content to scroll
  const maxScrollHeight = Math.max(body.scrollHeight, html.scrollHeight);
  const hasScrollableContent = maxScrollHeight > window.innerHeight + 50;
  
  // If overflow isn't blocked and there's content, window scroll should work
  if (!htmlBlocked && !bodyBlocked && hasScrollableContent) {
    return true;
  }
  
  // Additional check: try to determine if scroll would work
  // by checking if scrollHeight > clientHeight on document
  if (!htmlBlocked && html.scrollHeight > html.clientHeight) {
    return true;
  }
  
  if (!bodyBlocked && body.scrollHeight > body.clientHeight) {
    return true;
  }
  
  return false;
}

/**
 * Find all potential scroll container candidates
 */
function findScrollCandidates(viewportWidth: number, viewportHeight: number): ScrollCandidate[] {
  const candidates: ScrollCandidate[] = [];
  
  // Query elements that commonly serve as scroll containers
  const potentialContainers = document.querySelectorAll(
    'main, [role="main"], #root, #app, #__next, .app, .main, .content, ' +
    '.page-wrapper, .page-content, .main-content, .scroll-container, ' +
    'div[class*="container"], div[class*="wrapper"], div[class*="content"]'
  );
  
  // Also check direct children of body
  const bodyChildren = Array.from(document.body.children);
  
  const allElements = new Set([...potentialContainers, ...bodyChildren]);
  
  for (const element of allElements) {
    if (!(element instanceof HTMLElement)) continue;
    
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    
    // Must have scrollable overflow
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
    
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    
    // Must have actual scrollable content
    if (scrollHeight <= clientHeight) continue;
    
    // Minimum scroll capacity (filter out tiny scrollers)
    if (scrollHeight < 1000) continue;
    
    const rect = element.getBoundingClientRect();
    
    // Minimum viewport coverage - filter out small component scrollers
    const widthCoverage = rect.width / viewportWidth;
    const heightCoverage = rect.height / viewportHeight;
    
    if (widthCoverage < 0.5 || heightCoverage < 0.4) continue;
    
    // Check if inside an overlay/modal (should be skipped)
    const isInsideOverlay = isElementInsideOverlay(element);
    if (isInsideOverlay) continue;
    
    // Calculate DOM depth
    const domDepth = getDomDepth(element);
    
    // Check for main content markers
    const containsMainContent = hasMainContentMarkers(element);
    
    candidates.push({
      element,
      score: 0, // Will be calculated later
      scrollHeight,
      clientHeight,
      rect,
      domDepth,
      containsMainContent,
      isInsideOverlay
    });
  }
  
  return candidates;
}

/**
 * Score a scroll container candidate
 * Higher score = more likely to be the main page scroller
 */
function scoreCandidate(
  candidate: ScrollCandidate,
  viewportWidth: number,
  viewportHeight: number
): number {
  let score = 0;
  
  const { rect, scrollHeight, clientHeight, domDepth, containsMainContent } = candidate;
  
  // Viewport coverage (max 30 points)
  const widthCoverage = rect.width / viewportWidth;
  const heightCoverage = rect.height / viewportHeight;
  score += Math.min(widthCoverage * 20, 20);
  score += Math.min(heightCoverage * 10, 10);
  
  // Scroll content ratio - more content = more likely main scroller (max 25 points)
  const scrollRatio = scrollHeight / clientHeight;
  if (scrollRatio > 5) score += 25;
  else if (scrollRatio > 3) score += 20;
  else if (scrollRatio > 2) score += 15;
  else if (scrollRatio > 1.5) score += 10;
  
  // Absolute scroll height - main content usually has lots of content (max 15 points)
  if (scrollHeight > 5000) score += 15;
  else if (scrollHeight > 3000) score += 12;
  else if (scrollHeight > 2000) score += 8;
  else if (scrollHeight > 1000) score += 5;
  
  // DOM depth - shallower is better for main scroller (max 15 points)
  if (domDepth <= 2) score += 15;
  else if (domDepth <= 3) score += 12;
  else if (domDepth <= 4) score += 8;
  else if (domDepth <= 5) score += 5;
  
  // Contains main content markers (max 15 points)
  if (containsMainContent) score += 15;
  
  return score;
}

/**
 * Check if element is inside a modal/overlay
 */
function isElementInsideOverlay(element: Element): boolean {
  let current: Element | null = element;
  
  while (current && current !== document.body) {
    // Check for modal/overlay indicators
    const role = current.getAttribute('role');
    if (role === 'dialog' || role === 'alertdialog') return true;
    
    const className = (current.className || '').toLowerCase();
    const id = (current.id || '').toLowerCase();
    
    const overlayPatterns = ['modal', 'overlay', 'popup', 'dialog', 'lightbox'];
    for (const pattern of overlayPatterns) {
      if (className.includes(pattern) || id.includes(pattern)) return true;
    }
    
    // Check for fixed positioning (often used for overlays)
    const style = window.getComputedStyle(current);
    if (style.position === 'fixed' && current !== element) {
      // It's inside a fixed container but not the element itself
      const rect = current.getBoundingClientRect();
      // If the fixed container is smaller than viewport, it's likely an overlay
      if (rect.width < window.innerWidth * 0.9 || rect.height < window.innerHeight * 0.9) {
        return true;
      }
    }
    
    current = current.parentElement;
  }
  
  return false;
}

/**
 * Get DOM depth from body
 */
function getDomDepth(element: Element): number {
  let depth = 0;
  let current: Element | null = element;
  
  while (current && current !== document.body) {
    depth++;
    current = current.parentElement;
  }
  
  return depth;
}

/**
 * Check if element contains main content markers
 */
function hasMainContentMarkers(element: Element): boolean {
  // Check for h1 (main page heading)
  if (element.querySelector('h1')) return true;
  
  // Check for main landmark
  if (element.querySelector('main, [role="main"]')) return true;
  
  // Check if the element itself is a main landmark
  if (element.tagName.toLowerCase() === 'main') return true;
  if (element.getAttribute('role') === 'main') return true;
  
  // Check for substantial text content (more than 500 chars indicates main content)
  const textLength = (element.textContent || '').trim().length;
  if (textLength > 500) return true;
  
  return false;
}

/**
 * Scroll the detected container to a specific position
 */
export function scrollContainer(
  containerInfo: ScrollContainerInfo,
  scrollTop: number,
  behavior: ScrollBehavior = 'instant'
): void {
  if (containerInfo.isCustomContainer && containerInfo.element) {
    containerInfo.element.scrollTo({ top: scrollTop, behavior });
  } else {
    window.scrollTo({ top: scrollTop, behavior });
  }
}

/**
 * Get current scroll position from the detected container
 */
export function getScrollPosition(containerInfo: ScrollContainerInfo): number {
  if (containerInfo.isCustomContainer && containerInfo.element) {
    return containerInfo.element.scrollTop;
  }
  return window.pageYOffset || document.documentElement.scrollTop;
}

/**
 * Get total scrollable height from the detected container
 */
export function getScrollHeight(containerInfo: ScrollContainerInfo): number {
  if (containerInfo.isCustomContainer && containerInfo.element) {
    return containerInfo.element.scrollHeight;
  }
  return Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );
}
