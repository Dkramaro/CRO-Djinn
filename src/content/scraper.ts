import { RawPageData } from '../types';

export class PageScraper {
  async scrapePage(): Promise<RawPageData> {
    // Wait for page to be fully loaded
    await this.waitForPageReady();

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
          
          // Skip hidden elements
          if (!this.isVisible(parent)) {
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

    return textContent.trim();
  }

  private extractStructuredContent(): any {
    const headings = this.getHeadings();
    const buttons = this.getButtons();
    const links = this.getLinks();
    const forms = this.getForms();
    const images = this.getImages();
    const lists = this.getLists();

    return {
      headings,
      buttons,
      links,
      forms,
      images,
      lists,
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
        const styles = window.getComputedStyle(heading);
        
        headings.push({
          tag: heading.tagName.toLowerCase(),
          text,
          visible: this.isVisible(heading),
          position: {
            top: Math.round(rect.top + window.scrollY),
            left: Math.round(rect.left + window.scrollX),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          styles: {
            fontSize: styles.fontSize,
            fontWeight: styles.fontWeight,
            color: styles.color,
            textAlign: styles.textAlign
          },
          index
        });
      }
    });

    return headings;
  }

  private getButtons(): any[] {
    const buttons: any[] = [];
    const buttonElements = document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], a');
    
    buttonElements.forEach((button, index) => {
      const text = button.textContent?.trim() || (button as HTMLInputElement).value || '';
      if (text && this.isVisible(button)) {
        const rect = button.getBoundingClientRect();
        const styles = window.getComputedStyle(button);
        
        buttons.push({
          text,
          tag: button.tagName.toLowerCase(),
          type: (button as HTMLInputElement).type || 'button',
          visible: this.isVisible(button),
          position: {
            top: Math.round(rect.top + window.scrollY),
            left: Math.round(rect.left + window.scrollX),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          styles: {
            backgroundColor: styles.backgroundColor,
            color: styles.color,
            fontSize: styles.fontSize,
            padding: `${styles.paddingTop} ${styles.paddingRight} ${styles.paddingBottom} ${styles.paddingLeft}`,
            border: styles.border,
            borderRadius: styles.borderRadius
          },
          attributes: {
            href: (button as HTMLAnchorElement).href || null,
            class: button.className,
            id: button.id
          },
          index
        });
      }
    });

    return buttons;
  }

  private getLinks(): any[] {
    const links: any[] = [];
    const linkElements = document.querySelectorAll('a[href]');
    
    linkElements.forEach((link, index) => {
      const text = link.textContent?.trim();
      if (text && this.isVisible(link)) {
        const rect = link.getBoundingClientRect();
        const styles = window.getComputedStyle(link);
        
        links.push({
          text,
          href: (link as HTMLAnchorElement).href,
          visible: this.isVisible(link),
          position: {
            top: Math.round(rect.top + window.scrollY),
            left: Math.round(rect.left + window.scrollX),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          styles: {
            color: styles.color,
            fontSize: styles.fontSize,
            textDecoration: styles.textDecoration
          },
          attributes: {
            class: link.className,
            id: link.id,
            target: (link as HTMLAnchorElement).target
          },
          index
        });
      }
    });

    return links;
  }

  private getForms(): any[] {
    const forms: any[] = [];
    const formElements = document.querySelectorAll('form');

    formElements.forEach((form, index) => {
      if (this.isVisible(form)) {
        const inputs = Array.from(form.querySelectorAll('input, select, textarea')).map(input => {
          const rect = input.getBoundingClientRect();
    return {
            tag: input.tagName.toLowerCase(),
            type: (input as HTMLInputElement).type || 'text',
            name: (input as HTMLInputElement).name || '',
            placeholder: (input as HTMLInputElement).placeholder || '',
            required: input.hasAttribute('required'),
            position: {
              top: Math.round(rect.top + window.scrollY),
              left: Math.round(rect.left + window.scrollX),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
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
          width: img.naturalWidth || rect.width,
          height: img.naturalHeight || rect.height,
          position: {
            top: Math.round(rect.top + window.scrollY),
            left: Math.round(rect.left + window.scrollX),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          index
        });
      }
    });

    return images;
  }

  private getLists(): any[] {
    const lists: any[] = [];
    const listElements = document.querySelectorAll('ul, ol');

    listElements.forEach((list, index) => {
      if (this.isVisible(list)) {
        const items = Array.from(list.querySelectorAll('li')).map(li => li.textContent?.trim() || '');
        
        lists.push({
          tag: list.tagName.toLowerCase(),
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
            tag: section.tagName.toLowerCase(),
            class: section.className,
            id: section.id,
            textPreview: text,
            position: {
              top: Math.round(rect.top + window.scrollY),
              left: Math.round(rect.left + window.scrollX),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            index
          });
        }
      }
    });

    return sections;
  }

  private getPageMetadata(): any {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight
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
}

// Export for use in content script
export async function scrapePage(): Promise<RawPageData> {
  const scraper = new PageScraper();
  return await scraper.scrapePage();
}

