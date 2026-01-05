import { RawPageData } from '../types';

// Cache for detected scroll container
interface ScrollContainerCache {
  element: Element | null;
  isCustomContainer: boolean;
  scrollHeight: number;
}

export class PageScraper {
  private scrollContainerCache: ScrollContainerCache | null = null;

  async scrapePage(): Promise<RawPageData> {
    // Wait for page to be fully loaded
    await this.waitForPageReady();

    // Detect scroll container once for consistent position calculations
    this.scrollContainerCache = this.detectScrollContainer();

    const url = window.location.href;
    const title = document.title;
    const metaDescription = this.getMetaDescription();
    
    // Get raw HTML content
    const fullHTML = document.documentElement.outerHTML;
    
    // Extract all visible text content (no limits)
    const fullTextContent = this.extractFullTextContent();
    
    // Get structured content elements
    const structuredContent = this.extractStructuredContent();
    
    // Get basic page metadata  
    const pageMetadata = this.getPageMetadata();

    return {
      url,
      title,
      metaDescription,
      fullHTML,
      fullTextContent,
      structuredContent,
      pageMetadata,
      timestamp: Date.now()
    };
  }

  /**
   * Detect main scroll container for accurate position calculations
   * Handles SPAs where body has overflow:hidden and a child element scrolls
   */
  private detectScrollContainer(): ScrollContainerCache {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Check if window scrolling works normally
    const html = document.documentElement;
    const body = document.body;
    const htmlStyle = window.getComputedStyle(html);
    const bodyStyle = window.getComputedStyle(body);
    
    const htmlBlocked = htmlStyle.overflowY === 'hidden';
    const bodyBlocked = bodyStyle.overflowY === 'hidden';
    
    const maxScrollHeight = Math.max(body.scrollHeight, html.scrollHeight);
    const hasScrollableContent = maxScrollHeight > viewportHeight + 50;
    
    // If window scroll works, use it
    if ((!htmlBlocked && !bodyBlocked && hasScrollableContent) ||
        (!htmlBlocked && html.scrollHeight > html.clientHeight) ||
        (!bodyBlocked && body.scrollHeight > body.clientHeight)) {
      return {
        element: null,
        isCustomContainer: false,
        scrollHeight: maxScrollHeight
      };
    }
    
    // Find custom scroll container
    const potentialContainers = document.querySelectorAll(
      'main, [role="main"], #root, #app, #__next, .app, .main, .content, ' +
      '.page-wrapper, .page-content, .main-content, .scroll-container, ' +
      'div[class*="container"], div[class*="wrapper"], div[class*="content"]'
    );
    const bodyChildren = Array.from(document.body.children);
    const allElements = new Set([...potentialContainers, ...bodyChildren]);
    
    let bestCandidate: { element: Element; score: number; scrollHeight: number } | null = null;
    
    for (const element of allElements) {
      if (!(element instanceof HTMLElement)) continue;
      
      const style = window.getComputedStyle(element);
      if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') continue;
      
      const scrollHeight = element.scrollHeight;
      const clientHeight = element.clientHeight;
      if (scrollHeight <= clientHeight || scrollHeight < 1000) continue;
      
      const rect = element.getBoundingClientRect();
      const widthCoverage = rect.width / viewportWidth;
      const heightCoverage = rect.height / viewportHeight;
      if (widthCoverage < 0.5 || heightCoverage < 0.4) continue;
      
      // Skip if inside overlay
      if (this.isInsideOverlay(element)) continue;
      
      // Score candidate
      let score = 0;
      score += Math.min(widthCoverage * 20, 20);
      score += Math.min(heightCoverage * 10, 10);
      
      const scrollRatio = scrollHeight / clientHeight;
      if (scrollRatio > 5) score += 25;
      else if (scrollRatio > 3) score += 20;
      else if (scrollRatio > 2) score += 15;
      
      if (scrollHeight > 5000) score += 15;
      else if (scrollHeight > 3000) score += 12;
      else if (scrollHeight > 2000) score += 8;
      
      // DOM depth - prefer shallow
      let depth = 0;
      let current: Element | null = element;
      while (current && current !== document.body) { depth++; current = current.parentElement; }
      if (depth <= 2) score += 15;
      else if (depth <= 3) score += 12;
      else if (depth <= 4) score += 8;
      
      // Main content markers
      if (element.querySelector('h1') || element.querySelector('main, [role="main"]')) score += 15;
      
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { element, score, scrollHeight };
      }
    }
    
    if (bestCandidate && bestCandidate.score >= 50) {
      return {
        element: bestCandidate.element,
        isCustomContainer: true,
        scrollHeight: bestCandidate.scrollHeight
      };
    }
    
    return {
      element: null,
      isCustomContainer: false,
      scrollHeight: maxScrollHeight
    };
  }

  private isInsideOverlay(element: Element): boolean {
    let current: Element | null = element;
    while (current && current !== document.body) {
      const role = current.getAttribute('role');
      if (role === 'dialog' || role === 'alertdialog') return true;
      
      const className = (current.className || '').toString().toLowerCase();
      const id = (current.id || '').toLowerCase();
      const patterns = ['modal', 'overlay', 'popup', 'dialog', 'lightbox'];
      for (const pattern of patterns) {
        if (className.includes(pattern) || id.includes(pattern)) return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  /**
   * Get current scroll position accounting for custom scroll containers
   */
  private getScrollY(): number {
    if (this.scrollContainerCache?.isCustomContainer && this.scrollContainerCache.element) {
      return this.scrollContainerCache.element.scrollTop;
    }
    return window.scrollY;
  }

  /**
   * Get total scroll height accounting for custom scroll containers
   */
  private getScrollHeight(): number {
    if (this.scrollContainerCache?.isCustomContainer) {
      return this.scrollContainerCache.scrollHeight;
    }
    return document.documentElement.scrollHeight;
  }

  private async waitForPageReady(): Promise<void> {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        setTimeout(resolve, 100); // Short idle timeout
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(resolve, 100);
        });
      }
    });
  }

  private getMetaDescription(): string {
    const metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    return metaDesc?.content || '';
  }

  private extractFullTextContent(): string {
    // Extract ALL visible text content without arbitrary limits
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          // Skip script and style elements
          if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip tracking/analytics elements
          if (this.isTrackingElement(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip hidden elements
          if (!this.isVisible(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Filter out tracking-related text content
          const text = node.textContent?.trim() || '';
          if (this.isTrackingText(text)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let textContent = '';
    let node;

    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim();
      if (text) {
        textContent += text + ' ';
      }
    }

    // Clean up any remaining CSS/tracking noise from the content
    return this.cleanContent(textContent.trim());
  }

  private extractStructuredContent(): any {
    const headings = this.getHeadings();
    const interactiveElements = this.getInteractiveElements();
    const forms = this.getForms();
    const images = this.getImages();
    const lists = this.getLists();
    const videos = this.getVideos();
    const interactive = this.getInteractiveWidgets();
    const stickyHeader = this.detectStickyHeader();

    return {
      headings,
      interactiveElements,
      forms,
      images,
      lists,
      videos,
      interactive,
      stickyHeader,
      sections: this.getSections()
    };
  }

  private getHeadings(): any[] {
    const headings: any[] = [];
    const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    headingElements.forEach((heading, index) => {
      const text = heading.textContent?.trim();
      if (text && this.isVisible(heading)) {
        const rect = heading.getBoundingClientRect();
        const topPosition = Math.round(rect.top + this.getScrollY());
        
        headings.push({
          tag: heading.tagName?.toLowerCase() || '',
          text,
          visible: this.isVisible(heading),
          position: {
            top: topPosition
          },
          index
        });
      }
    });

    return headings;
  }

  private getInteractiveElements(): any[] {
    const elements: any[] = [];
    
    // Query all potentially interactive elements
    const selector = [
      'button',
      'input[type="submit"]',
      'input[type="button"]',
      '[role="button"]',
      'a[href]'
    ].join(', ');
    
    const interactiveElements = document.querySelectorAll(selector);
    
    interactiveElements.forEach((elem, index) => {
      const text = elem.textContent?.trim() || (elem as HTMLInputElement).value || '';
      
      // MINIMAL FILTERING: Only remove genuinely irrelevant noise
      if (!text || !this.isVisible(elem)) {
        return; // Skip empty or invisible
      }
      
      if (this.isTrackingElement(elem)) {
        return; // Skip analytics/tracking
      }
      
      if (this.isCookieConsentElement(text)) {
        return; // Skip cookie banners
      }
      
      // Get comprehensive visual context
      const rect = elem.getBoundingClientRect();
      const styles = window.getComputedStyle(elem);
      const tag = elem.tagName.toLowerCase();
      
      // Determine element type
      const isButton = tag === 'button' || 
                       (elem as HTMLElement).getAttribute('role') === 'button' ||
                       (tag === 'input' && ['submit', 'button'].includes((elem as HTMLInputElement).type));
      const isLink = tag === 'a';
      
      elements.push({
        text,
        elementType: isButton ? 'button' : 'link',
        tag,
        href: (elem as HTMLAnchorElement).href || null,
        type: (elem as HTMLInputElement).type || null,
        position: {
          top: Math.round(rect.top + this.getScrollY()),
          left: Math.round(rect.left + window.scrollX),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        styles: {
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          textDecoration: styles.textDecoration,
          display: styles.display
        },
        attributes: {
          class: elem.className,
          id: elem.id,
          target: (elem as HTMLAnchorElement).target || null,
          ariaLabel: elem.getAttribute('aria-label')
        },
        isAboveFold: rect.top + this.getScrollY() < window.innerHeight,
        index
      });
    });
    
    // Return ALL elements, no arbitrary limits
    return elements;
  }

  private getForms(): any[] {
    const forms: any[] = [];
    const formElements = document.querySelectorAll('form');

    formElements.forEach((form, index) => {
      if (this.isVisible(form)) {
        const inputs = Array.from(form.querySelectorAll('input, select, textarea')).map(input => {
    return {
            tag: input.tagName?.toLowerCase() || '',
            type: (input as HTMLInputElement).type || 'text',
            name: (input as HTMLInputElement).name || '',
            placeholder: (input as HTMLInputElement).placeholder || '',
            required: input.hasAttribute('required')
          };
        });

        forms.push({
          action: (form as HTMLFormElement).action || '',
          method: (form as HTMLFormElement).method || 'get',
          inputs,
          totalFields: inputs.length,
          requiredFields: inputs.filter(input => input.required).length,
          index
        });
      }
    });

    return forms;
  }

  private getImages(): any[] {
    const images: any[] = [];
    const imageElements = document.querySelectorAll('img');

    imageElements.forEach((img, index) => {
      if (this.isVisible(img)) {
        const rect = img.getBoundingClientRect();
        
        images.push({
          src: img.src,
          alt: img.alt || '',
          title: img.title || '',
          hasSize: !!(img.naturalWidth && img.naturalHeight),
          isAnimated: img.src.toLowerCase().includes('.gif') || 
                      img.src.toLowerCase().includes('giphy') ||
                      img.closest('[class*="anim"]') !== null,
          parentSection: this.getParentSectionIdentifier(img),
          index
        });
      }
    });

    return images;
  }

  private getVideos(): any[] {
    const videos: any[] = [];
    const videoElements = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"], iframe[src*="loom"]');
    
    videoElements.forEach((video, index) => {
      if (this.isVisible(video)) {
        const isNativeVideo = video.tagName.toLowerCase() === 'video';
        const rect = video.getBoundingClientRect();
        
        videos.push({
          type: video.tagName.toLowerCase(),
          src: (video as HTMLVideoElement).src || (video as HTMLIFrameElement).src || '',
          autoplay: video.hasAttribute('autoplay'),
          muted: video.hasAttribute('muted'),
          controls: isNativeVideo ? video.hasAttribute('controls') : true, // iframes assumed to have controls
          loop: video.hasAttribute('loop'),
          poster: isNativeVideo ? (video as HTMLVideoElement).poster : null,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          parentSection: this.getParentSectionIdentifier(video),
          index
        });
      }
    });
    
    return videos;
  }

  private getInteractiveWidgets(): any[] {
    const interactive: any[] = [];
    
    // Detect carousels/sliders by common patterns
    const carouselElements = document.querySelectorAll(
      '[class*="carousel"], [class*="slider"], [class*="swiper"], ' +
      '[class*="slide-show"], [data-carousel], [data-slider], ' +
      '[class*="glide"], [class*="splide"], [class*="slick"]'
    );
    
    carouselElements.forEach((elem, index) => {
      if (this.isVisible(elem)) {
        const itemCount = elem.querySelectorAll('[class*="slide"], [class*="item"], [class*="card"]').length;
        
        if (itemCount > 1) { // Only count real carousels
          interactive.push({
            type: 'carousel',
            itemCount,
            hasControls: !!(elem.querySelector('[class*="prev"], [class*="next"], [class*="arrow"]')),
            hasDots: !!(elem.querySelector('[class*="dot"], [class*="pagination"]')),
            parentSection: this.getParentSectionIdentifier(elem),
            index
          });
        }
      }
    });
    
    return interactive;
  }

  private detectStickyHeader(): any {
    const fixedElements: Array<{element: Element, height: number, top: number}> = [];
    
    // Find elements with fixed or sticky positioning at the top
    const allElements = document.querySelectorAll('*');
    
    for (const element of allElements) {
      const style = window.getComputedStyle(element);
      const position = style.position;
      
      // Check for fixed or sticky positioning
      if (position === 'fixed' || position === 'sticky') {
        const rect = element.getBoundingClientRect();
        const height = rect.height;
        const top = rect.top;
        const tag = element.tagName.toLowerCase();
        
        // Check if this is a semantic header/nav element by tag or class name
        const isHeaderElement = tag === 'header' || tag === 'nav' || 
                               element.className.toLowerCase().includes('header') ||
                               element.className.toLowerCase().includes('nav');
        
        // Use different threshold based on element type
        // Headers get more tolerance for spacing/banners above them
        const topThreshold = isHeaderElement ? 200 : 50;
        
        // Only consider elements that are:
        // 1. Actually visible (height > 0)
        // 2. At the top of the viewport (within threshold)
        // 3. Have meaningful height (at least 20px)
        if (height > 20 && top <= topThreshold && rect.bottom > 0 && this.isVisible(element)) {
          fixedElements.push({ element, height, top });
        }
      }
    }
    
    if (fixedElements.length === 0) {
      return {
        exists: false,
        type: null,
        height: 0,
        elements: []
      };
    }
    
    // Sort by top position and height to find the most prominent header
    fixedElements.sort((a, b) => {
      if (Math.abs(a.top - b.top) < 10) {
        return b.height - a.height;
      }
      return a.top - b.top;
    });
    
    // Calculate total header height
    let totalHeaderHeight = 0;
    let lastBottom = 0;
    
    for (const fixed of fixedElements) {
      const rect = fixed.element.getBoundingClientRect();
      if (rect.top >= lastBottom - 10) {
        totalHeaderHeight += rect.height;
        lastBottom = rect.bottom;
      }
    }
    
    // Extract what's in the sticky header
    const headerContents = fixedElements.map(({ element }) => {
      const tag = element.tagName.toLowerCase();
      const text = element.textContent?.trim().substring(0, 200) || '';
      
      // Find CTAs in the sticky header
      const ctaButtons = element.querySelectorAll('button, a[href], [role="button"]');
      const ctas = Array.from(ctaButtons)
        .filter(btn => this.isVisible(btn))
        .map(btn => btn.textContent?.trim())
        .filter(text => text && text.length > 0)
        .slice(0, 5); // Limit to 5 CTAs
      
      return {
        tag,
        textPreview: text,
        ctas,
        height: element.getBoundingClientRect().height
      };
    });
    
    return {
      exists: true,
      type: fixedElements[0].element.tagName.toLowerCase(),
      positionType: window.getComputedStyle(fixedElements[0].element).position,
      totalHeight: Math.round(totalHeaderHeight),
      elementCount: fixedElements.length,
      contents: headerContents
    };
  }

  private getParentSectionIdentifier(element: Element): string {
    // Find parent section/container
    const section = element.closest('section, article, main, [class*="section"]');
    if (!section) return 'header';
    
    // Create simple identifier
    const sectionIndex = Array.from(document.querySelectorAll('section, article, main, [class*="section"]'))
      .indexOf(section);
    
    const headingInSection = section.querySelector('h1, h2, h3');
    const headingText = headingInSection?.textContent?.trim().substring(0, 30) || '';
    
    return headingText ? `Section ${sectionIndex + 1}: ${headingText}` : `Section ${sectionIndex + 1}`;
  }

  private getLists(): any[] {
    const lists: any[] = [];
    const listElements = document.querySelectorAll('ul, ol');

    listElements.forEach((list, index) => {
      if (this.isVisible(list)) {
        const items = Array.from(list.querySelectorAll('li')).map(li => li.textContent?.trim() || '');
        
        lists.push({
          tag: list.tagName?.toLowerCase() || '',
          items: items.filter(item => item.length > 0),
          itemCount: items.length,
          index
        });
      }
    });

    return lists;
  }

  private getSections(): any[] {
    const sections: any[] = [];
    const sectionElements = document.querySelectorAll('section, article, main, header, footer, nav, aside, div[class*="section"], div[class*="container"]');

    sectionElements.forEach((section, index) => {
      if (this.isVisible(section)) {
        const rect = section.getBoundingClientRect();
        const text = section.textContent?.trim().substring(0, 500) || ''; // First 500 chars of section
        
        if (text.length > 20) { // Only include sections with meaningful content
          sections.push({
            tag: section.tagName?.toLowerCase() || '',
            class: section.className,
            id: section.id,
          textPreview: text,
          index
          });
        }
      }
    });

    return sections;
  }

  private getPageMetadata(): any {
    const scrollHeight = this.getScrollHeight();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollHeight: scrollHeight,
      isMobile: window.innerWidth < 768,
      hasVerticalScroll: scrollHeight > window.innerHeight,
      hasCustomScrollContainer: this.scrollContainerCache?.isCustomContainer || false
    };

    // Get viewport meta tag
    const viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
    
    // Get other important meta tags
    const metaTags: any = {};
    document.querySelectorAll('meta').forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property');
      const content = meta.getAttribute('content');
      if (name && content) {
        metaTags[name] = content;
      }
    });
    
    return {
      viewport,
      viewportMeta: viewportMeta?.content || '',
      metaTags,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      language: document.documentElement.lang || 'en'
    };
  }

  private isVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  private getContrastLevel(backgroundColor: string, textColor: string): string {
    // Simple contrast assessment without exact calculations
    if (!backgroundColor || !textColor) return 'unknown';
    
    // Basic heuristic based on color names/keywords
    const bgLower = backgroundColor.toLowerCase();
    const textLower = textColor.toLowerCase();
    
    if ((bgLower.includes('white') || bgLower.includes('rgb(255')) && 
        (textLower.includes('black') || textLower.includes('rgb(0'))) {
      return 'high';
    }
    
    if ((bgLower.includes('black') || bgLower.includes('rgb(0')) && 
        (textLower.includes('white') || textLower.includes('rgb(255'))) {
      return 'high';
    }
    
    return 'medium';
  }

  // === CONTENT FILTERING UTILITIES ===

  private isTrackingElement(element: Element): boolean {
    const id = (typeof element.id === 'string' ? element.id : '').toLowerCase();
    const className = (typeof element.className === 'string' ? element.className : '').toLowerCase();
    
    // Check for tracking-related IDs and classes
    const trackingPatterns = [
      'gtm', 'analytics', 'tracking', 'facebook', 'fbq', 'hotjar', 'segment',
      'google-tag', 'ga-', 'utm_', 'cookie', 'consent', 'optanon'
    ];
    
    return trackingPatterns.some(pattern => 
      id.includes(pattern) || className.includes(pattern)
    ) || !!element.closest('script, style, noscript');
  }

  private isTrackingText(text: string): boolean {
    if (typeof text !== 'string') return false;
    const lowerText = text.toLowerCase();
    
    // Skip tracking/analytics related text
    const trackingKeywords = [
      'window.___chunkmapping', 'window.___webpack', 'analytics.', 'fbq(',
      'gtm.start', '_hjsettings', 'google-analytics', 'googletagmanager',
      'hotjar', 'segment.com', 'optanonwrapper', 'dataLayer'
    ];
    
    return trackingKeywords.some(keyword => lowerText.includes(keyword));
  }

  private isCookieConsentElement(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    
    const lowerText = text.toLowerCase();
    
    // Only filter EXACT cookie consent patterns
    const cookiePatterns = [
      'accept all cookies',
      'accept cookies',
      'manage cookies',
      'cookie preferences',
      'manage consent',
      'cookie settings',
      'privacy settings',
      'opt out of cookies',
      'confirm my choices',
      'reject all cookies'
    ];
    
    // Must be exact or very close match (not just contain the word "cookie")
    return cookiePatterns.some(pattern => {
      return lowerText === pattern || 
             (lowerText.length < 30 && lowerText.includes(pattern));
    });
  }

  private cleanContent(content: string): string {
    // Remove CSS class patterns
    content = content.replace(/\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, '');
    content = content.replace(/\.section[a-f0-9-]+/g, '');
    
    // Remove CSS style blocks
    content = content.replace(/\{[^}]*\}/g, '');
    
    // Remove JavaScript chunks and webpack references
    content = content.replace(/window\.___[^;]+;?/g, '');
    content = content.replace(/\{\\?"[^"]*\\?":\[\\?"[^"]*\\?"\]/g, '');
    
    // Remove tracking function calls
    content = content.replace(/\b(fbq|gtag|analytics)\([^)]*\)/g, '');
    
    // Clean up multiple spaces and line breaks
    content = content.replace(/\s+/g, ' ').trim();
    
    return content;
  }
}

// Export for use in content script
export async function scrapePage(): Promise<RawPageData> {
  const scraper = new PageScraper();
  return await scraper.scrapePage();
}

