import { jsPDF } from 'jspdf';
import { LLMAnalysis, RawPageData } from '../types';

// Utility function to load PNG images as base64 data URLs
async function loadImageAsBase64(imagePath: string): Promise<string> {
  try {
    const response = await fetch(chrome.runtime.getURL(imagePath));
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Failed to load image: ${imagePath}`, error);
    throw error;
  }
}

export class PDFExporter {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number;
  private yPosition: number;
  private lineHeight: number;
  private colors: {
    primary: [number, number, number];
    secondary: [number, number, number];
    success: [number, number, number];
    warning: [number, number, number];
    danger: [number, number, number];
    info: [number, number, number];
    text: [number, number, number];
    lightGray: [number, number, number];
    background: [number, number, number];
    accent: [number, number, number];
    muted: [number, number, number];
  };

  // Base64-encoded star rating images (PNG)
  private starImages: {
    oneStar: string;
    twoStars: string;
    threeStars: string;
  };

  constructor() {
    this.doc = new jsPDF('portrait', 'mm', 'a4');
    
    // Set encoding and font configuration to prevent character spacing issues
    this.doc.setCharSpace(0); // Ensure no character spacing
    this.doc.setFont('helvetica', 'normal');
    
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.margin = 26; // 30% larger margins
    this.yPosition = this.margin;
    this.lineHeight = 5;
    
    // Premium enterprise color palette - sophisticated and harmonious
    this.colors = {
      primary: [30, 41, 59],        // Rich slate blue for premium authority (#1e293b)
      secondary: [71, 85, 105],     // Sophisticated slate gray (#475569)
      success: [21, 128, 61],       // Refined forest green (#15803d) 
      warning: [217, 119, 6],       // Elegant amber (#d97706)
      danger: [153, 27, 27],        // Sophisticated burgundy (#991b1b)
      info: [29, 78, 216],          // Premium sapphire blue (#1d4ed8)
      text: [15, 23, 42],           // Deep charcoal for maximum readability (#0f172a)
      lightGray: [248, 250, 252],   // Refined off-white (#f8fafc)
      background: [255, 255, 255],  // Pure white for clarity
      accent: [37, 99, 235],        // Refined royal blue (#2563eb)
      muted: [100, 116, 139]        // Elegant muted slate (#64748b)
    };

    // Initialize star images as empty - will be loaded async
    this.starImages = {
      oneStar: '',
      twoStars: '',
      threeStars: ''
    };
  }

  // Load PNG star images from the icons folder
  private async loadStarImages(): Promise<void> {
    try {
      const [oneStar, twoStars, threeStars] = await Promise.all([
        loadImageAsBase64('icons/1 Star.png'),
        loadImageAsBase64('icons/2 star.png'),
        loadImageAsBase64('icons/3 Star.png')
      ]);
      
      this.starImages = {
        oneStar,
        twoStars,
        threeStars
      };
    } catch (error) {
      console.error('Failed to load star images:', error);
      // Keep empty strings as fallback
    }
  }

  async exportAudit(
    analysis: LLMAnalysis,
    rawData: RawPageData,
    timestamp: number
  ): Promise<void> {
    // Load star images before generating PDF
    await this.loadStarImages();
    // Professional header without any branding
    this.addProfessionalHeader();
    
    // Page metadata with beautiful design
    this.addPageMetadata(rawData, analysis.starRating, timestamp);
    
    // Core content sections with sophisticated styling
    if (analysis.pageSummary) {
      this.addPageOverviewSection(analysis.pageSummary);
      this.addStrengthsWeaknessesSection(analysis.pageSummary);
    }
    
    this.addExecutiveSummarySection(analysis.executiveSummary || []);
    
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      this.addRecommendationsSection(analysis.recommendations);
    }
    
    // Quick Wins section
    if (analysis.quickWins && analysis.quickWins.length > 0) {
      this.addQuickWinsSection(analysis.quickWins);
    }
    
    // Visual CRO Analysis section
    if (analysis.visualCROAnalysis) {
      this.addVisualCROAnalysisSection(analysis.visualCROAnalysis);
    }
    
    if (analysis.copySuggestions && analysis.copySuggestions.length > 0) {
      this.addCopySuggestionsSection(analysis.copySuggestions);
    }
    
    this.addProfessionalFooter(timestamp);
    
    // Download the PDF with clean filename
    this.doc.save(`Landing_Page_Audit_${new Date(timestamp).toISOString().split('T')[0]}.pdf`);
  }

  private addProfessionalHeader(): void {
    // Professional header with clean modern theme
    this.doc.setFillColor(...this.colors.lightGray); // Clean off-white background
    this.doc.rect(0, 0, this.pageWidth, 40, 'F');
    
    // Add subtle gradient effect with professional blue accent line at bottom
    this.doc.setDrawColor(...this.colors.accent); // Professional blue accent
    this.doc.setLineWidth(1);
    this.doc.line(0, 40, this.pageWidth, 40);
    
    // Main title with sophisticated typography
    this.doc.setTextColor(...this.colors.text);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(22);
    this.doc.text('Landing Page Conversion Audit', this.margin, 18);
    
    // Professional subtitle
    this.doc.setTextColor(...this.colors.secondary);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(12);
    this.doc.text('Comprehensive Analysis & Optimization Recommendations', this.margin, 30);
    
    this.yPosition = 55;
  }

  private addPageMetadata(rawData: RawPageData, starRating: 1 | 2 | 3, timestamp: number): void {
    // Beautiful metadata section with professional styling
    this.doc.setFillColor(...this.colors.lightGray); // Clean off-white background
    this.doc.roundedRect(this.margin - 8, this.yPosition - 6, this.pageWidth - (2 * this.margin) + 16, 35, 6, 6, 'F');
    
    // Add subtle border
    this.doc.setDrawColor(...this.colors.primary);
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(this.margin - 8, this.yPosition - 6, this.pageWidth - (2 * this.margin) + 16, 35, 6, 6, 'S');
    
    // Left side content
    // Page title
    this.doc.setTextColor(...this.colors.accent);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.text('Page:', this.margin, this.yPosition + 2);
    this.doc.setTextColor(...this.colors.text);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(11);
    this.doc.text(rawData.title || 'Untitled Page', this.margin + 28, this.yPosition + 2);
    
    // URL
    this.yPosition += 10;
    this.doc.setTextColor(...this.colors.accent);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('URL:', this.margin, this.yPosition + 2);
    this.doc.setTextColor(...this.colors.text);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    const url = rawData.url || 'Unknown URL';
    const maxUrlLength = 70; // Truncate long URLs
    const displayUrl = url.length > maxUrlLength ? url.substring(0, maxUrlLength) + '...' : url;
    this.doc.text(displayUrl, this.margin + 28, this.yPosition + 2);
    
    // Date
    this.yPosition += 10;
    this.doc.setTextColor(...this.colors.accent);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.text('Date:', this.margin, this.yPosition + 2);
    this.doc.setTextColor(...this.colors.text);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }), this.margin + 28, this.yPosition + 2);
    
    // Right side - Star rating images centered and hugging right margin
    const starImageX = this.pageWidth - this.margin - 24; // Hug right margin (24mm = image width)
    const starImageY = 16; // Centered vertically in 40mm header (40-8)/2 = 16mm from top
    
    // Select appropriate star image based on rating
    let starImageData: string;
    if (starRating === 3) {
      starImageData = this.starImages.threeStars;
    } else if (starRating === 2) {
      starImageData = this.starImages.twoStars;
    } else {
      starImageData = this.starImages.oneStar;
    }
    
    // Add star image to PDF (reduced size by 60% = 40% of original)
    this.addStarImage(starImageData, starImageX, starImageY, 24, 8);
    
    this.yPosition += 12; // Further reduced to bring Page Overview section closer
  }

  private addStarImage(imageData: string, x: number, y: number, width: number, height: number): void {
    try {
      if (imageData && imageData.length > 0) {
        // Add PNG image to PDF using jsPDF's addImage method
        this.doc.addImage(imageData, 'PNG', x, y, width, height);
      } else {
        // No image data available, show fallback
        this.addStarImageFallback(x, y);
      }
    } catch (error) {
      console.warn('Failed to add star image to PDF, falling back to text:', error);
      this.addStarImageFallback(x, y);
    }
  }

  private addStarImageFallback(x: number, y: number): void {
    // Fallback to text-based star rating display
    this.doc.setTextColor(...this.colors.accent);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.doc.text('Rating', x + 5, y + 12);
  }

  private addPageOverviewSection(pageSummary: any): void {
    this.addSectionHeaderProfessional('Page Overview');
    
    // Comprehensive business information with proper text wrapping
    const details = [
      { label: 'Business Type:', value: pageSummary.businessType || 'Not specified' },
      { label: 'Page Type:', value: pageSummary.pageType || 'Not specified' },
      { label: 'Purchase Behavior:', value: this.formatPurchaseBehavior(pageSummary.purchaseBehaviorType) || 'Not specified' },
      { label: 'Conversion Goal:', value: pageSummary.primaryConversionGoal || 'Not specified' },
      { label: 'Target Audience:', value: pageSummary.targetAudience || 'Not specified' }
    ];
    
    details.forEach(detail => {
      this.doc.setTextColor(...this.colors.accent);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.text(detail.label, this.margin, this.yPosition);
      
      this.doc.setTextColor(...this.colors.text);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      
      // Proper text wrapping with safe margins - adjusted to prevent overlap
      const valueStartX = this.margin + 40; // Increased from 28 to 40 to prevent text overlap
      const maxTextWidth = this.pageWidth - valueStartX - this.margin; // Respect right margin
      const value = this.wrapText(detail.value, maxTextWidth);
      value.forEach((line, index) => {
        if (index === 0) {
          this.doc.text(line, valueStartX, this.yPosition);
        } else {
          this.yPosition += 5;
          this.doc.text(line, valueStartX, this.yPosition);
        }
      });
      this.yPosition += 8; // Reduced spacing to prevent content overflow
    });
    
    this.yPosition += 3; // Minimal spacing
    
    // Industry Context section
    if (pageSummary.industryContext) {
      this.yPosition += 5;
      this.addSubsectionHeader('Industry Context');
      this.yPosition += 8;
      
      this.doc.setTextColor(...this.colors.text);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      
      const maxWidth = this.pageWidth - (2 * this.margin);
      const contextLines = this.wrapText(pageSummary.industryContext, maxWidth);
      contextLines.forEach(line => {
        this.doc.text(line, this.margin, this.yPosition);
        this.yPosition += 5;
      });
    }
    
    // Customer Journey section
    if (pageSummary.currentUserJourney && pageSummary.currentUserJourney.length > 0) {
      this.yPosition += 5;
      this.addSubsectionHeader('Customer Journey');
      this.yPosition += 8;
      
      this.doc.setTextColor(...this.colors.text);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      
      const maxWidth = this.pageWidth - (2 * this.margin) - 10; // Account for numbering
      pageSummary.currentUserJourney.forEach((step: string, index: number) => {
        // Add step number
        this.doc.setTextColor(...this.colors.accent);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(`${index + 1}.`, this.margin, this.yPosition);
        
        // Add step text
        this.doc.setTextColor(...this.colors.text);
        this.doc.setFont('helvetica', 'normal');
        
        const stepLines = this.wrapText(step, maxWidth);
        stepLines.forEach((line, lineIndex) => {
          const xPosition = lineIndex === 0 ? this.margin + 10 : this.margin + 10;
          this.doc.text(line, xPosition, this.yPosition);
          if (lineIndex < stepLines.length - 1) {
            this.yPosition += 5;
          }
        });
        this.yPosition += 6;
      });
    }
  }

  private formatPurchaseBehavior(behaviorType: string): string {
    if (!behaviorType) return 'Not specified';
    
    switch (behaviorType.toLowerCase()) {
      case 'high-consideration':
        return 'High Consideration';
      case 'low-consideration':
        return 'Low Consideration';
      case 'impulse':
        return 'Impulse Purchase';
      default:
        return behaviorType.charAt(0).toUpperCase() + behaviorType.slice(1);
    }
  }

  private addSubsectionHeader(title: string): void {
    this.doc.setTextColor(...this.colors.accent);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.text(title, this.margin, this.yPosition);
  }

  private addNewPage(): void {
    this.doc.addPage();
    this.yPosition = this.margin; // Reset position to top of new page
  }

  private addStrengthsWeaknessesSection(pageSummary: any): void {
    // Start a new page for Strengths & Weaknesses
    this.addNewPage();
    
    // Modern header with gradient-like effect (matching other sections)
    this.yPosition += 2;
    this.addSectionHeaderProfessional('Strengths & Weaknesses Analysis');
    
    if (!pageSummary.keyStrengths && !pageSummary.criticalWeaknesses) {
      this.doc.setTextColor(...this.colors.text);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(11);
      this.doc.text('No strengths or weaknesses data available', this.margin, this.yPosition);
      return;
    }

    // Process Strengths first
    if (pageSummary.keyStrengths && pageSummary.keyStrengths.length > 0) {
      // Add "Key Strengths" header in professional emerald
      this.doc.setTextColor(...this.colors.success); // Professional emerald green
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(14);
      this.doc.text('Key Strengths', this.margin, this.yPosition);
      this.yPosition += 8; // Space after header
      
      pageSummary.keyStrengths.forEach((strength: string, index: number) => {
        // Calculate text width for content
        const safeTextWidth = this.pageWidth - (2 * this.margin) - 20;
        
        // Store starting position for dynamic height calculation
        const cardStartY = this.yPosition;
        
        // First, calculate the height by simulating content placement
        let calculatedHeight = 3; // Top padding
        
        // Calculate text height for the strength item
        const cleanStrength = this.sanitizeTextForPDF(strength);
        const wrappedStrength = this.wrapText(cleanStrength, safeTextWidth - 10);
        calculatedHeight += (wrappedStrength.length * 4) + 2;
        
        calculatedHeight += 1; // Bottom buffer
        
        // Draw container first with calculated height (refined green styling for strengths)
        this.doc.setFillColor(240, 253, 244); // Elegant light green tint
        this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'F');
        
        this.doc.setDrawColor(22, 163, 74); // Refined forest green border
        this.doc.setLineWidth(0.3);
        this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'S');
        
        // Professional emerald vertical accent bar on the left (for strengths)
        this.doc.setFillColor(...this.colors.success); // Professional emerald green
        this.doc.roundedRect(this.margin - 2, this.yPosition - 1, 4, calculatedHeight, 0, 0, 'F');
        
        // Now add text content on top of the container
        // Strength text (the actual content)
        this.doc.setTextColor(0, 0, 0); // Black text for visibility
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(10);
        const strengthCleanText = this.sanitizeTextForPDF(strength);
        const strengthWrappedText = this.wrapText(strengthCleanText, safeTextWidth - 10);
        
        let textY = this.yPosition + 5; // Better vertical alignment - more space from card top
        strengthWrappedText.forEach((line, lineIndex) => {
          const cleanLine = this.sanitizeTextForPDF(line);
          this.doc.setCharSpace(0);
          this.doc.setFont('helvetica', 'normal');
          this.doc.setFontSize(10);
          this.doc.setTextColor(0, 0, 0); // Ensure black text
          
          // Preserve important characters by using a more selective approach
          const safeLine = cleanLine.replace(/[^\x20-\x7E]/g, ''); // Only remove non-printable characters
          this.doc.text(safeLine, this.margin + 8, textY); // Better horizontal alignment - more space from vertical bar
          textY += 4.5; // Slightly more line spacing for better readability
        });
        
        // Move to next card position
        this.yPosition = cardStartY + calculatedHeight + 5; // Spacing between cards
      });
    }
    
    // Process Issues/Weaknesses second
    if (pageSummary.criticalWeaknesses && pageSummary.criticalWeaknesses.length > 0) {
      // Add extra spacing before Critical Issues section for prominence
      this.yPosition += 15; // More space from Key Strengths section
      
      // Add "Critical Issues" header with visual prominence
      this.doc.setTextColor(...this.colors.danger); // Professional red
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(16); // Larger font size for prominence
      
      // Add a subtle background highlight for the header
      const headerText = 'Critical Issues';
      const headerWidth = this.doc.getTextWidth(headerText);
      this.doc.setFillColor(254, 242, 242); // Sophisticated light burgundy background
      this.doc.roundedRect(this.margin - 4, this.yPosition - 2, headerWidth + 8, 8, 2, 2, 'F');
      
      // Draw the header text
      this.doc.text(headerText, this.margin, this.yPosition + 2);
      this.yPosition += 12; // More space after header
      
      pageSummary.criticalWeaknesses.forEach((weakness: string, index: number) => {
        // Calculate text width for content
        const safeTextWidth = this.pageWidth - (2 * this.margin) - 20;
        
        // Store starting position for dynamic height calculation
        const cardStartY = this.yPosition;
        
        // First, calculate the height by simulating content placement
        let calculatedHeight = 3; // Top padding
        
        // Calculate text height for the weakness item
        const cleanWeakness = this.sanitizeTextForPDF(weakness);
        const wrappedWeakness = this.wrapText(cleanWeakness, safeTextWidth - 10);
        calculatedHeight += (wrappedWeakness.length * 4) + 2;
        
        calculatedHeight += 1; // Bottom buffer
        
        // Draw container first with calculated height (sophisticated burgundy styling for issues)
        this.doc.setFillColor(254, 242, 242); // Elegant light burgundy tint
        this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'F');
        
        this.doc.setDrawColor(220, 38, 38); // Refined burgundy border
        this.doc.setLineWidth(0.3);
        this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'S');
        
        // Professional red vertical accent bar on the left (for issues)
        this.doc.setFillColor(...this.colors.danger); // Professional red
        this.doc.roundedRect(this.margin - 2, this.yPosition - 1, 4, calculatedHeight, 0, 0, 'F');
        
        // Now add text content on top of the container
        // Weakness text (the actual content)
        this.doc.setTextColor(0, 0, 0); // Black text for visibility
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(10);
        const weaknessCleanText = this.sanitizeTextForPDF(weakness);
        const weaknessWrappedText = this.wrapText(weaknessCleanText, safeTextWidth - 10);
        
        let textY = this.yPosition + 5; // Better vertical alignment - more space from card top
        weaknessWrappedText.forEach((line, lineIndex) => {
          const cleanLine = this.sanitizeTextForPDF(line);
          this.doc.setCharSpace(0);
          this.doc.setFont('helvetica', 'normal');
          this.doc.setFontSize(10);
          this.doc.setTextColor(0, 0, 0); // Ensure black text
          
          // Preserve important characters by using a more selective approach
          const safeLine = cleanLine.replace(/[^\x20-\x7E]/g, ''); // Only remove non-printable characters
          this.doc.text(safeLine, this.margin + 8, textY); // Better horizontal alignment - more space from vertical bar
          textY += 4.5; // Slightly more line spacing for better readability
        });
        
        // Move to next card position
        this.yPosition = cardStartY + calculatedHeight + 5; // Spacing between cards
      });
    }
    
    this.yPosition += 5;
  }

  private addExecutiveSummarySection(summary: string[]): void {
    // Start a new page for Executive Summary to match Copy Suggestions
    this.addNewPage();
    
    // Modern header with gradient-like effect (matching Copy Suggestions)
    this.yPosition += 2;
    this.addSectionHeaderProfessional('Executive Summary');
    
    summary.forEach((item, index) => {
      // Calculate text width for content
      const safeTextWidth = this.pageWidth - (2 * this.margin) - 20;
      
      // Store starting position for dynamic height calculation
      const cardStartY = this.yPosition;
      
      // First, calculate the height by simulating content placement
      let calculatedHeight = 0; // Start with no padding
      
      // Calculate text height for the summary item
      const cleanItem = this.sanitizeTextForPDF(item);
      const wrappedItem = this.wrapText(cleanItem, safeTextWidth - 10);
      
      // Match the actual text rendering: starts at +3, uses 4.2pt line spacing
      calculatedHeight += 3; // Text starts 3pt from card top
      calculatedHeight += (wrappedItem.length * 4.2); // 4.2pt line spacing
      calculatedHeight += 3; // Bottom padding to match top padding
      
      // Draw container first with calculated height (matching Copy Suggestions)
      this.doc.setFillColor(255, 255, 255);
      this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'F');
      
      this.doc.setDrawColor(220, 220, 220);
      this.doc.setLineWidth(0.3);
      this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'S');
      
      // Charcoal vertical accent bar on the left (matching Copy Suggestions)
      this.doc.setFillColor(...this.colors.primary);
      this.doc.roundedRect(this.margin - 2, this.yPosition - 1, 4, calculatedHeight, 0, 0, 'F');
      
      // Now add text content on top of the container
      // Summary text (the actual content)
      this.doc.setTextColor(0, 0, 0); // Black text for visibility
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      const summaryCleanItem = this.sanitizeTextForPDF(item);
      const summaryWrappedItem = this.wrapText(summaryCleanItem, safeTextWidth - 10);
      
      let textY = this.yPosition + 3; // Start text below the card top
      summaryWrappedItem.forEach((line, lineIndex) => {
        const cleanLine = this.sanitizeTextForPDF(line);
        this.doc.setCharSpace(0);
        
        // Preserve important characters by using a more selective approach
        const safeLine = cleanLine.replace(/[^\x20-\x7E]/g, ''); // Only remove non-printable characters
        
        // Check if this line contains a label (text ending with ":")
        const labelMatch = safeLine.match(/^([^:]+:)\s*(.*)$/);
        
        if (labelMatch) {
          // Split into label and content
          const label = labelMatch[1]; // e.g., "Context:"
          const content = labelMatch[2]; // e.g., "Direct-to-consumer telehealth homepage..."
          
          // Draw label in vibrant blue
          this.doc.setFont('helvetica', 'bold');
          this.doc.setFontSize(10);
          this.doc.setTextColor(...this.colors.accent); // Vibrant blue color
          this.doc.text(label, this.margin + 6, textY);
          
          // Draw content in black right after the label (if there's content after the colon)
          if (content.trim()) {
            // Calculate the width of the label to position content correctly
            const labelWidth = this.doc.getTextWidth(label);
            this.doc.setFont('helvetica', 'normal');
            this.doc.setFontSize(10);
            this.doc.setTextColor(0, 0, 0); // Black color
            this.doc.text(content, this.margin + 6 + labelWidth, textY);
          }
        } else {
          // Regular line without label - draw in black
          this.doc.setFont('helvetica', 'normal');
          this.doc.setFontSize(10);
          this.doc.setTextColor(0, 0, 0); // Black color
          this.doc.text(safeLine, this.margin + 6, textY);
        }
        
        textY += 4.2; // Slightly better line spacing for improved readability
      });
      
      // Move to next card position
      this.yPosition = cardStartY + calculatedHeight + 5; // Spacing between cards
    });
    
    this.yPosition += 5;
  }

  private addRecommendationsSection(recommendations: any[]): void {
    // Start a new page for Priority Recommendations
    this.addNewPage();
    
    const topRecommendations = recommendations.slice(0, 5);
    
    // Modern header with gradient-like effect (matching other sections)
    this.yPosition += 2;
    this.addSectionHeaderProfessional('Priority Recommendations');
    
    topRecommendations.forEach((rec, index) => {
      // Calculate text width based on actual card and text positioning
      // Card boundaries: (margin-2) to (pageWidth-margin+2), total width = pageWidth - (2*margin) + 4
      // Text starts at: margin+6 (6pt from left card edge)
      // Text should end: 6pt from right card edge
      // Available text width = card width - 12pt total padding
      const safeTextWidth = this.pageWidth - (2 * this.margin) - 8; // More generous width for better text flow
      
      // Use same width for implementation and why sections to maintain consistency
      const implementationWhyWidth = safeTextWidth;
      
      // Store starting position for dynamic height calculation
      const cardStartY = this.yPosition;
      
      // First, calculate the height by simulating content placement
      let calculatedHeight = 0; // Start with no padding
      
      // Set consistent font settings for accurate text width calculations
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(14);
      this.doc.setCharSpace(0);
      
      // Calculate title height - use same width as content for consistency  
      const titleText = `${index + 1}. ${rec.title}`;
      const titleTextWidth = safeTextWidth; // Use full available width
      const wrappedTitle = this.wrapText(titleText, titleTextWidth);
      calculatedHeight += 8; // Text starts 8pt from card top (increased from 3)
      calculatedHeight += (wrappedTitle.length * 5); // Increased line spacing for larger font
      calculatedHeight += 12; // Space for badges (increased from 8)
      
      // Set consistent font settings for issue/solution text calculations
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      this.doc.setCharSpace(0);
      
      // Calculate content sections height - use full text width
      const issueText = this.wrapText(rec.issue || rec.currentState || '', safeTextWidth);
      const solutionText = this.wrapText(rec.solution || rec.proposedChange || '', safeTextWidth);
      
      calculatedHeight += 8; // Section header spacing
      calculatedHeight += (issueText.length * 4.2);
      calculatedHeight += 8; // Between sections
      calculatedHeight += 8; // Section header spacing
      calculatedHeight += (solutionText.length * 4.2);
      
      // Add height for implementation section if available
      if (rec.implementation || rec.implementationDetails || rec.how) {
        calculatedHeight += 8; // Section header spacing
        
        // Set consistent font for implementation text calculations
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(10);
        this.doc.setCharSpace(0);
        
        const implementationData = rec.implementation || rec.implementationDetails || rec.how;
        if (Array.isArray(implementationData)) {
          implementationData.forEach((step) => {
            // Ensure consistent font settings for each step
            this.doc.setFont('helvetica', 'normal');
            this.doc.setFontSize(10);
            this.doc.setCharSpace(0);
            const stepText = this.wrapText(step, implementationWhyWidth - 9); // Account for bullet point spacing
            calculatedHeight += (stepText.length * 4.2);
            calculatedHeight += 2; // Between steps
          });
        } else {
          const implementationText = this.wrapText(implementationData, implementationWhyWidth);
          calculatedHeight += (implementationText.length * 4.2);
        }
        calculatedHeight += 8; // After implementation section
      }
      
      // Add height for psychology section if available
      if (rec.psychologyBehind || rec.psychology || rec.why) {
        calculatedHeight += 8; // Section header spacing
        
        // Set consistent font for psychology text calculations
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(10);
        this.doc.setCharSpace(0);
        
        const psychologyData = rec.psychologyBehind || rec.psychology || rec.why;
        const psychologyText = this.wrapText(psychologyData, implementationWhyWidth);
        calculatedHeight += (psychologyText.length * 4.2);
        calculatedHeight += 8; // After psychology section
      }
      
      calculatedHeight += 3; // Bottom padding to match top padding
      
      // Check for page break - but not for first recommendation to keep it with header
      if (index > 0) {
        const needsNewPage = this.checkNewPage(calculatedHeight + 10);
        // If we started a new page, add the Priority Recommendations header
        if (needsNewPage) {
          this.addPriorityRecommendationsHeader();
        }
      }
      
      // Draw container first with calculated height (matching other sections)
      this.doc.setFillColor(255, 255, 255);
      this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'F');
      
      // Light gray border
      this.doc.setDrawColor(200, 200, 200);
      this.doc.setLineWidth(0.5);
      this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'S');
      
      // Charcoal vertical accent bar on the left - sharp right angles
      this.doc.setFillColor(...this.colors.primary);
      this.doc.rect(this.margin - 2, this.yPosition - 1, 4, calculatedHeight, 'F');
      
      // Now add text content on top of the container
      // Recommendation title in vibrant blue accent
      this.doc.setTextColor(...this.colors.accent);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(14); // Increased from 11 to 14 for bigger title
      
      let titleY = this.yPosition + 8; // Increased from 3 to 8 for more space from card top
      wrappedTitle.forEach((line) => {
        const cleanLine = this.sanitizeTextForPDF(line);
        this.doc.setCharSpace(0);
        const safeLine = cleanLine.replace(/[^\x20-\x7E]/g, '');
        this.doc.text(safeLine, this.margin + 6, titleY);
        titleY += 5; // Increased line spacing to match larger font
      });
      
      // Single compact badge row with color coding by priority
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setCharSpace(0);
      
      // Calculate badge position
      const badgeY = titleY + 2;
      
      // Create compact badge text
      const effortLabel = this.getEffortLabel(rec.effort);
      const timelineText = rec.timeline ? rec.timeline : 'TBD';
      const badgeText = `${rec.priority.toUpperCase()} • ${effortLabel} Effort • ${timelineText} to implement`;
      
      // Get priority-based color for the badge
      const priorityColor = this.getPriorityColor(rec.priority);
      
      // Calculate badge width based on text with consistent font settings
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(8);
      this.doc.setCharSpace(0);
      const badgeTextWidth = this.doc.getTextWidth(badgeText);
      const badgeWidth = badgeTextWidth + 12; // Add padding
      
      // Draw single compact badge
      this.doc.setFillColor(...priorityColor);
      this.doc.roundedRect(this.margin + 6, badgeY, badgeWidth, 8, 2, 2, 'F');
      this.doc.setTextColor(255, 255, 255);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(8);
      this.doc.setCharSpace(0);
      this.doc.text(badgeText, this.margin + 8, badgeY + 5.5); // Center text vertically in 8pt badge
      
      let textY = badgeY + 18; // Increased space after badge for better visual separation
      
      // Issue section
      this.doc.setTextColor(...this.colors.danger); // Professional red for ISSUE label
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setCharSpace(0);
      this.doc.text('ISSUE:', this.margin + 6, textY);
      textY += 8;
      
      // Ensure consistent font settings for issue text
      this.doc.setTextColor(0, 0, 0);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      this.doc.setCharSpace(0);
      issueText.forEach((line) => {
        const cleanLine = this.sanitizeTextForPDF(line);
        const safeLine = cleanLine.replace(/[^\x20-\x7E]/g, '');
        this.doc.text(safeLine, this.margin + 6, textY);
        textY += 4.2;
      });
      
      textY += 6; // Space between sections
      
      // Solution section
      this.doc.setTextColor(...this.colors.success); // Professional emerald for SOLUTION label
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setCharSpace(0);
      this.doc.text('SOLUTION:', this.margin + 6, textY);
      textY += 8;
      
      // Ensure consistent font settings for solution text
      this.doc.setTextColor(0, 0, 0);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      this.doc.setCharSpace(0);
      solutionText.forEach((line) => {
        const cleanLine = this.sanitizeTextForPDF(line);
        const safeLine = cleanLine.replace(/[^\x20-\x7E]/g, '');
        this.doc.text(safeLine, this.margin + 6, textY);
        textY += 4.2;
      });
      
      textY += 6; // Space between sections
      
      // How to implement section (if available)
      if (rec.implementation || rec.implementationDetails || rec.how) {
        this.doc.setTextColor(...this.colors.accent);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(10);
        this.doc.setCharSpace(0);
        this.doc.text('HOW TO IMPLEMENT:', this.margin + 6, textY);
        textY += 8;
        
        this.doc.setTextColor(0, 0, 0);
        this.doc.setFont('helvetica', 'normal');
        
        const implementationData = rec.implementation || rec.implementationDetails || rec.how;
        if (Array.isArray(implementationData)) {
          // Handle array of implementation steps
          implementationData.forEach((step) => {
            // Bullet point
            this.doc.setTextColor(...this.colors.accent);
            this.doc.setFont('helvetica', 'bold');
            this.doc.setFontSize(10);
            this.doc.setCharSpace(0);
            this.doc.text('-', this.margin + 8, textY);
            
            // Step text - ensure consistent font settings before wrapping
            this.doc.setTextColor(0, 0, 0);
            this.doc.setFont('helvetica', 'normal');
            this.doc.setFontSize(10);
            this.doc.setCharSpace(0);
            const stepText = this.wrapText(step, implementationWhyWidth - 9);
            stepText.forEach((line) => {
              const cleanLine = this.sanitizeTextForPDF(line);
              const safeLine = cleanLine.replace(/[^\x20-\x7E]/g, '');
              this.doc.text(safeLine, this.margin + 15, textY);
              textY += 4.2;
            });
            textY += 2; // Space between steps
          });
        } else {
          // Handle string implementation - ensure consistent font settings
          this.doc.setFont('helvetica', 'normal');
          this.doc.setFontSize(10);
          this.doc.setCharSpace(0);
          const implementationText = this.wrapText(implementationData, implementationWhyWidth);
          implementationText.forEach((line) => {
            const cleanLine = this.sanitizeTextForPDF(line);
            const safeLine = cleanLine.replace(/[^\x20-\x7E]/g, '');
            this.doc.text(safeLine, this.margin + 6, textY);
            textY += 4.2;
          });
        }
        textY += 6; // Space after implementation section
      }
      
      // Why this works section (if available)
      if (rec.psychologyBehind || rec.psychology || rec.why) {
        this.doc.setTextColor(...this.colors.accent);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(10);
        this.doc.setCharSpace(0);
        this.doc.text('WHY THIS WORKS:', this.margin + 6, textY);
        textY += 8;
        
        // Ensure consistent font settings for psychology text
        this.doc.setTextColor(0, 0, 0);
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(10);
        this.doc.setCharSpace(0);
        const psychologyData = rec.psychologyBehind || rec.psychology || rec.why;
        const psychologyText = this.wrapText(psychologyData, implementationWhyWidth);
        psychologyText.forEach((line) => {
          const cleanLine = this.sanitizeTextForPDF(line);
          const safeLine = cleanLine.replace(/[^\x20-\x7E]/g, '');
          this.doc.text(safeLine, this.margin + 6, textY);
          textY += 4.2;
        });
        textY += 6; // Space after psychology section
      }
      
      // Move to next card position
      this.yPosition = cardStartY + calculatedHeight + 5; // Spacing between cards
    });
    
    this.yPosition += 15;
  }

  private addCopySuggestionsSection(suggestions: any[]): void {
    // Start a new page for Copy Suggestions to match Quick Wins
    this.addNewPage();
    
    // Modern header with gradient-like effect (matching Quick Wins)
    this.yPosition += 2;
    this.addSectionHeaderProfessional('Copy Suggestions');
    
    suggestions.forEach((suggestion, index) => {
      // Calculate text width for content
      const safeTextWidth = this.pageWidth - (2 * this.margin) - 20;
      
      // Store starting position for dynamic height calculation
      const cardStartY = this.yPosition;
      
      // First, calculate the height by simulating content placement
      let calculatedHeight = 3; // Top padding
      
      // Calculate section name height (e.g., "Title", "Bullet 1", etc.)
      const cleanSection = this.sanitizeTextForPDF(suggestion.section || '');
      const wrappedSection = this.wrapText(cleanSection, safeTextWidth - 10);
      calculatedHeight += (wrappedSection.length * 5) + 2;
      
      // Calculate suggestion text height
      if (suggestion.suggestion) {
        const cleanSuggestion = this.sanitizeTextForPDF(suggestion.suggestion);
        const suggestionLines = this.wrapText(cleanSuggestion, safeTextWidth - 10);
        calculatedHeight += (suggestionLines.length * 4) + 2;
      }
      
      calculatedHeight += 1; // Bottom buffer
      
      // Draw container first with calculated height (matching Quick Wins)
      this.doc.setFillColor(255, 255, 255);
      this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'F');
      
      this.doc.setDrawColor(220, 220, 220);
      this.doc.setLineWidth(0.3);
      this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'S');
      
      // Charcoal vertical accent bar on the left (matching Quick Wins)
      this.doc.setFillColor(...this.colors.primary);
      this.doc.roundedRect(this.margin - 2, this.yPosition - 1, 4, calculatedHeight, 0, 0, 'F');
      
      // Now add text content on top of the container
      // Section name (e.g., "Title", "Bullet 1") with blue accent styling
      this.doc.setTextColor(...this.colors.accent); // Blue accent text for theme
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(11);
      
      let sectionY = this.yPosition + 3;
      wrappedSection.forEach((line) => {
        const cleanLine = this.sanitizeTextForPDF(line);
        this.doc.setCharSpace(0);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(11);
        this.doc.setTextColor(...this.colors.accent); // Ensure blue accent text
        
        // Preserve important characters by using a more selective approach
        const safeLine = cleanLine.replace(/[^\x20-\x7E]/g, ''); // Only remove non-printable characters
        this.doc.text(safeLine, this.margin + 6, sectionY);
        sectionY += 5;
      });
      
      this.yPosition = sectionY + 2;
      
      // Suggestion text (the actual copy content)
      if (suggestion.suggestion) {
        this.doc.setTextColor(0, 0, 0); // Black text for visibility
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(10);
        const cleanSuggestion = this.sanitizeTextForPDF(suggestion.suggestion);
        const suggestionLines = this.wrapText(cleanSuggestion, safeTextWidth - 10);
        suggestionLines.forEach((line, lineIndex) => {
          const cleanLine = this.sanitizeTextForPDF(line);
          this.doc.setCharSpace(0);
          this.doc.setFont('helvetica', 'normal');
          this.doc.setFontSize(10);
          this.doc.setTextColor(0, 0, 0); // Ensure black text
          
          // Preserve important characters like $, +, commas, etc. by using a more selective approach
          const safeLine = cleanLine.replace(/[^\x20-\x7E]/g, ''); // Only remove non-printable characters
          this.doc.text(safeLine, this.margin + 6, this.yPosition);
          this.yPosition += 4;
        });
        this.yPosition += 2;
      }
      
      // Move to next card position
      this.yPosition = cardStartY + calculatedHeight + 5; // Spacing between cards
    });
    
    this.yPosition += 5;
  }

  private addQuickWinsSection(quickWins: any[]): void {
    // Start a new page for Quick Wins
    this.addNewPage();
    
    // Modern header with gradient-like effect
    this.yPosition += 2;
    this.addSectionHeaderProfessional('Quick Wins');
    
    quickWins.forEach((win, index) => {
      // Calculate text width for content
      const safeTextWidth = this.pageWidth - (2 * this.margin) - 20;
      
      // Store starting position for dynamic height calculation
      const cardStartY = this.yPosition;
      
      // First, calculate the height by simulating content placement
      const tempY = this.yPosition;
      let calculatedHeight = 3; // Top padding
      
      // Calculate title height (effort/timeline now on same line, so no extra height needed)
      const cleanTitle = this.sanitizeTextForPDF(win.title || '');
      const wrappedTitle = this.wrapText(cleanTitle, safeTextWidth - 10);
      calculatedHeight += (wrappedTitle.length * 5) + 2;
      
      // Calculate description height (now with inline "What to do:" label)
      if (win.description) {
        const cleanDescription = this.sanitizeTextForPDF(win.description);
        // Set font to get accurate label width
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(10);
        const labelWidth = this.doc.getTextWidth('What to do:');
        const contentWidth = safeTextWidth - labelWidth - 5;
        const descriptionLines = this.wrapText(cleanDescription, contentWidth);
        calculatedHeight += (descriptionLines.length * 4) + 1; // Reduced spacing to match rendering
      }
      
      // Calculate rationale height (now with inline "Why:" label)
      if (win.rationale) {
        const cleanRationale = this.sanitizeTextForPDF(win.rationale);
        // Set font to get accurate label width
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(10);
        const labelWidth = this.doc.getTextWidth('Why:');
        const contentWidth = safeTextWidth - labelWidth - 5;
        const rationaleLines = this.wrapText(cleanRationale, contentWidth);
        calculatedHeight += (rationaleLines.length * 4) + 2;
      }
      
      calculatedHeight += 1; // Bottom buffer
      
      // Draw container first with calculated height
      this.doc.setFillColor(255, 255, 255);
      this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'F');
      
      this.doc.setDrawColor(220, 220, 220);
      this.doc.setLineWidth(0.3);
      this.doc.roundedRect(this.margin - 2, this.yPosition - 1, this.pageWidth - (2 * this.margin) + 4, calculatedHeight, 3, 3, 'S');
      
      // Charcoal vertical accent bar on the left (like executive summary)
      this.doc.setFillColor(...this.colors.primary);
      this.doc.roundedRect(this.margin - 2, this.yPosition - 1, 4, calculatedHeight, 0, 0, 'F');
      
      // Now add text content on top of the container
      // Title and effort/timeline on the same line (matching popup layout)
      this.doc.setTextColor(...this.colors.accent); // Blue accent text for theme
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(11);
      
      let titleY = this.yPosition + 3;
      
      // Render title on the left side
      wrappedTitle.forEach((line) => {
        const cleanLine = this.sanitizeTextForPDF(line);
        this.doc.setCharSpace(0);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(11);
        this.doc.setTextColor(...this.colors.accent); // Ensure blue accent text
        
        const encodedLine = encodeURIComponent(cleanLine).replace(/%20/g, ' ').replace(/%[0-9A-F]{2}/g, '');
        this.doc.text(encodedLine || cleanLine, this.margin + 6, titleY);
        titleY += 5;
      });
      
      // Add effort/timeline on the same line as the first title line  
      this.doc.setTextColor(...this.colors.muted); // Elegant muted slate for subtle metadata
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(7); // Smaller font size
      
      const effortLabel = this.getEffortLabel(win.effort);
      let metadataText = `Effort: ${effortLabel}`;
      if (win.timeline) {
        metadataText += ` • Timeline: ${win.timeline}`;
      }
      
      // Position metadata on the same line as the title (right side)
      const metadataX = this.pageWidth - this.margin - 2;
      this.doc.text(metadataText, metadataX, this.yPosition + 3, { align: 'right' });
      
      this.yPosition = titleY + 2;
      
      // What to do section with inline label
      if (win.description) {
        this.doc.setTextColor(...this.colors.accent); // Blue accent text for "What to do:" label
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(10);
        this.doc.text('What to do:', this.margin + 6, this.yPosition);
        
        // Add description content on the same line
        this.doc.setTextColor(0, 0, 0); // Black text for content
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(10);
        const cleanDescription = this.sanitizeTextForPDF(win.description);
        
        // Calculate width available for content after "What to do:" label
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(10);
        const labelWidth = this.doc.getTextWidth('What to do:');
        const contentWidth = safeTextWidth - labelWidth - 5; // 5pt spacing between label and content
        const descriptionLines = this.wrapText(cleanDescription, contentWidth);
        
        descriptionLines.forEach((line, lineIndex) => {
          const cleanLine = this.sanitizeTextForPDF(line);
          this.doc.setCharSpace(0);
          this.doc.setFont('helvetica', 'normal');
          this.doc.setFontSize(10);
          this.doc.setTextColor(0, 0, 0); // Ensure black text
          
          const encodedLine = encodeURIComponent(cleanLine).replace(/%20/g, ' ').replace(/%[0-9A-F]{2}/g, '');
          const xPosition = lineIndex === 0 ? this.margin + 6 + labelWidth + 5 : this.margin + 6; // First line after label, subsequent lines aligned with label
          this.doc.text(encodedLine || cleanLine, xPosition, this.yPosition);
          this.yPosition += 4;
        });
        this.yPosition += 1; // Reduced spacing between What to do and Why sections
      }
      
      // Why section with inline label
      if (win.rationale) {
        this.doc.setTextColor(...this.colors.accent); // Blue accent text for "Why:" label
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(10);
        this.doc.text('Why:', this.margin + 6, this.yPosition);
        
        // Add rationale content on the same line
        this.doc.setTextColor(0, 0, 0); // Black text for content
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(10);
        const cleanRationale = this.sanitizeTextForPDF(win.rationale);
        
        // Calculate width available for content after "Why:" label
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(10);
        const labelWidth = this.doc.getTextWidth('Why:');
        const contentWidth = safeTextWidth - labelWidth - 5; // 5pt spacing between label and content
        const rationaleLines = this.wrapText(cleanRationale, contentWidth);
        
        rationaleLines.forEach((line, lineIndex) => {
          const cleanLine = this.sanitizeTextForPDF(line);
          this.doc.setCharSpace(0);
          this.doc.setFont('helvetica', 'normal');
          this.doc.setFontSize(10);
          this.doc.setTextColor(0, 0, 0); // Ensure black text for content
          
          const encodedLine = encodeURIComponent(cleanLine).replace(/%20/g, ' ').replace(/%[0-9A-F]{2}/g, '');
          const xPosition = lineIndex === 0 ? this.margin + 6 + labelWidth + 5 : this.margin + 6; // First line after label, subsequent lines aligned with label
          this.doc.text(encodedLine || cleanLine, xPosition, this.yPosition);
          this.yPosition += 4;
        });
        this.yPosition += 2;
      }
      
      // Move to next card position
      this.yPosition = cardStartY + calculatedHeight + 5; // Spacing between cards
    });
    
    this.yPosition += 5;
  }

  private addVisualCROAnalysisSection(visualAnalysis: any): void {
    // Start a new page for Visual CRO Analysis
    this.addNewPage();
    
    // Modern header
    this.yPosition += 2;
    this.addSectionHeaderProfessional('Visual CRO Analysis');
    
    // Create array of sections to process
    const sections: Array<{ title: string; data: any }> = [];
    if (visualAnalysis.visualFlow) {
      sections.push({ title: 'Visual Flow Analysis', data: visualAnalysis.visualFlow });
    }
    if (visualAnalysis.colorContrast) {
      sections.push({ title: 'Color & Contrast Evaluation', data: visualAnalysis.colorContrast });
    }
    if (visualAnalysis.criticalIssue) {
      sections.push({ title: 'Critical Visual Issue', data: visualAnalysis.criticalIssue });
    }
    
    // Process each section with modern card design
    sections.forEach((section, index) => {
      this.addModernVisualAnalysisCard(section.title, section.data, index);
    });
    
    this.yPosition += 5;
  }

  private addModernVisualAnalysisCard(title: string, data: any, index: number): void {
    // Calculate text width for content
    const safeTextWidth = this.pageWidth - (2 * this.margin) - 20;
    
    // Store starting position for dynamic height calculation
    const cardStartY = this.yPosition;
    
    // Premium enterprise colors for visual analysis sections - sophisticated and harmonious
    const sectionColors: Array<{ bg: [number, number, number]; border: [number, number, number]; accent: [number, number, number] }> = [
      { bg: [239, 246, 255], border: [59, 130, 246], accent: [29, 78, 216] },    // Premium sapphire blue for Visual Flow  
      { bg: [236, 253, 245], border: [34, 197, 94], accent: [21, 128, 61] },     // Refined forest green for Color & Contrast
      { bg: [254, 242, 242], border: [220, 38, 38], accent: [153, 27, 27] }      // Sophisticated burgundy for Critical Issue
    ];
    
    const colors = sectionColors[index % sectionColors.length];
    
    // First, calculate the height by simulating content placement
    let calculatedHeight = 8; // Top padding for header
    
    // Calculate title height
    const cleanTitle = this.sanitizeTextForPDF(title);
    const wrappedTitle = this.wrapText(cleanTitle, safeTextWidth - 20);
    calculatedHeight += (wrappedTitle.length * 6) + 4;
    
    // Calculate content height
    Object.entries(data).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        // Skip Urgency field for Critical Visual Issue (redundant)
        if (key.toLowerCase() === 'urgency' && title.toLowerCase().includes('critical')) {
          return;
        }
        
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        const cleanValue = this.sanitizeTextForPDF(String(value));
        
        // Special height calculation for Visual Flow Analysis
        if (key.toLowerCase() === 'eyeflowpath' || key.toLowerCase() === 'eyeflow') {
          const flowItems = cleanValue.split(/\s+/).filter(item => item.length > 0);
          const formattedFlow = flowItems.join(' -> ');
          const valueLines = this.wrapText(formattedFlow, safeTextWidth - 20);
          calculatedHeight += 4 + (valueLines.length * 4) + 3; // Restored normal spacing
        } else {
          const valueLines = this.wrapText(cleanValue, safeTextWidth - 20);
          calculatedHeight += 4 + (valueLines.length * 4) + 3; // Restored normal spacing
        }
      }
    });
    
    calculatedHeight += 8; // Bottom padding
    
    // Draw container with colored background
    this.doc.setFillColor(...colors.bg);
    this.doc.roundedRect(this.margin - 3, this.yPosition - 2, this.pageWidth - (2 * this.margin) + 6, calculatedHeight, 4, 4, 'F');
    
    // Colored border
    this.doc.setDrawColor(...colors.border);
    this.doc.setLineWidth(0.5);
    this.doc.roundedRect(this.margin - 3, this.yPosition - 2, this.pageWidth - (2 * this.margin) + 6, calculatedHeight, 4, 4, 'S');
    
    // Colored header bar
    this.doc.setFillColor(...colors.accent);
    this.doc.roundedRect(this.margin - 3, this.yPosition - 2, this.pageWidth - (2 * this.margin) + 6, 8, 4, 4, 'F');
    
    // Now add text content on top of the container
    // Section title in white on colored header
    this.doc.setTextColor(255, 255, 255); // White text on colored header
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    
    let titleY = this.yPosition + 2;
    wrappedTitle.forEach((line) => {
      const cleanLine = this.sanitizeTextForPDF(line);
      this.doc.setCharSpace(0);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(11);
      this.doc.setTextColor(255, 255, 255); // Ensure white text
      
      const encodedLine = encodeURIComponent(cleanLine).replace(/%20/g, ' ').replace(/%[0-9A-F]{2}/g, '');
      this.doc.text(encodedLine || cleanLine, this.margin, titleY);
      titleY += 6;
    });
    
    this.yPosition = cardStartY + 8 + (wrappedTitle.length * 6) + 3; // Reduced spacing between header and content
    
    // Process data fields with better styling and custom ordering for Critical Visual Issue
    const entries = Object.entries(data);
    
    // Custom ordering for Critical Visual Issue: Problem, Solution, Impact
    let orderedEntries = entries;
    if (title.toLowerCase().includes('critical')) {
      const fieldOrder = ['problem', 'solution', 'impact'];
      orderedEntries = [];
      
      // Add fields in specified order
      fieldOrder.forEach(fieldName => {
        const found = entries.find(([key]) => key.toLowerCase() === fieldName);
        if (found) orderedEntries.push(found);
      });
      
      // Add any remaining fields not in the order
      entries.forEach(([key, value]) => {
        if (!fieldOrder.includes(key.toLowerCase()) && key.toLowerCase() !== 'urgency') {
          orderedEntries.push([key, value]);
        }
      });
    }
    
    orderedEntries.forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        // Skip Urgency field for Critical Visual Issue (redundant)
        if (key.toLowerCase() === 'urgency' && title.toLowerCase().includes('critical')) {
          return;
        }
        
        // Format key as label
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        const cleanLabel = this.sanitizeTextForPDF(label);
        const cleanValue = this.sanitizeTextForPDF(String(value));
        
        // Special formatting for Visual Flow Analysis
        if (key.toLowerCase() === 'eyeflowpath' || key.toLowerCase() === 'eyeflow') {
          // Keep the original flow format with existing arrows, just clean it
          const formattedFlow = cleanValue.replace(/\s*->\s*/g, ' -> '); // Normalize arrow spacing
          
          // Add label in accent color
          this.doc.setTextColor(...colors.accent);
          this.doc.setFont('helvetica', 'bold');
          this.doc.setFontSize(10);
          this.doc.text(`${cleanLabel}:`, this.margin, this.yPosition);
          this.yPosition += 4; // Restored normal spacing
          
          // Add formatted flow in dark gray
          this.doc.setTextColor(40, 40, 40);
          this.doc.setFont('helvetica', 'normal');
          this.doc.setFontSize(9);
          const flowLines = this.wrapText(formattedFlow, safeTextWidth - 20);
          flowLines.forEach((line) => {
            const cleanLine = this.sanitizeTextForPDF(line);
            this.doc.setCharSpace(0);
            this.doc.setFont('helvetica', 'normal');
            this.doc.setFontSize(9);
            this.doc.setTextColor(40, 40, 40);
            
            // Use ASCII arrows that work in PDF
            this.doc.text(cleanLine, this.margin + 2, this.yPosition);
            this.yPosition += 4; // Restored normal line spacing
          });
          this.yPosition += 3; // Restored normal spacing after
        } else {
          // Regular formatting for other fields with normal spacing
          // Add label in accent color
          this.doc.setTextColor(...colors.accent);
          this.doc.setFont('helvetica', 'bold');
          this.doc.setFontSize(10);
          this.doc.text(`${cleanLabel}:`, this.margin, this.yPosition);
          this.yPosition += 4; // Normal spacing
          
          // Add value with wrapping in refined charcoal for premium readability
          this.doc.setTextColor(...this.colors.text);
          this.doc.setFont('helvetica', 'normal');
          this.doc.setFontSize(9);
          const valueLines = this.wrapText(cleanValue, safeTextWidth - 20);
          valueLines.forEach((line) => {
            const cleanLine = this.sanitizeTextForPDF(line);
            this.doc.setCharSpace(0);
            this.doc.setFont('helvetica', 'normal');
            this.doc.setFontSize(9);
            this.doc.setTextColor(...this.colors.text); // Premium deep charcoal for optimal readability
            
            const encodedLine = encodeURIComponent(cleanLine).replace(/%20/g, ' ').replace(/%[0-9A-F]{2}/g, '');
            this.doc.text(encodedLine || cleanLine, this.margin + 2, this.yPosition);
            this.yPosition += 4; // Restored normal line spacing
          });
          this.yPosition += 3; // Restored normal spacing after
        }
      }
    });
    
    // Move to next card position
    this.yPosition = cardStartY + calculatedHeight + 8; // More spacing between cards
  }

  private addSectionHeaderProfessional(title: string): void {
    this.checkNewPage(50); // Ignore return value for this method
    
    // Reduce spacing for specific sections
    if (title === 'Copy Suggestions' || title === 'Quick Wins' || title === 'Visual CRO Analysis') {
      this.yPosition += 8;
    } else if (title === 'Executive Summary') {
      this.yPosition += 10; // Reduced spacing for Executive Summary
    } else {
      this.yPosition += 15;
    }
    
    // Professional section header
    this.doc.setFillColor(...this.colors.primary);
    this.doc.roundedRect(this.margin - 8, this.yPosition - 10, this.pageWidth - (2 * this.margin) + 16, 20, 5, 5, 'F');
    
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(255, 255, 255);
    this.doc.text(title, this.margin, this.yPosition);
    this.yPosition += 25;
    
    this.doc.setTextColor(...this.colors.text);
  }

  private addPriorityRecommendationsHeader(): void {
    // Add Priority Recommendations header for new pages
    this.yPosition += 8; // Small spacing from top of new page
    
    // Professional section header
    this.doc.setFillColor(...this.colors.primary);
    this.doc.roundedRect(this.margin - 8, this.yPosition - 10, this.pageWidth - (2 * this.margin) + 16, 20, 5, 5, 'F');
    
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(255, 255, 255);
    this.doc.text('Priority Recommendations', this.margin, this.yPosition);
    this.yPosition += 25;
    
    this.doc.setTextColor(...this.colors.text);
  }

  private addProfessionalFooter(timestamp: number): void {
    // Calculate footer height to position it at bottom of page
    const footerText = 'This audit provides actionable insights for improving landing page conversion rates. ' +
                      'Recommendations are based on conversion optimization best practices and user experience principles.';
    const wrappedFooter = this.wrapText(footerText, this.pageWidth - (2 * this.margin));
    const footerHeight = (wrappedFooter.length * 4) + 15 + 10; // Text lines + spacing + separator + timestamp
    
    // Check if we need a new page for the footer
    const bottomMargin = this.margin + 10;
    const availableSpace = this.pageHeight - bottomMargin;
    
    if (this.yPosition + footerHeight > availableSpace) {
      this.doc.addPage();
      this.yPosition = this.margin;
    }
    
    // Position footer at bottom of page with proper spacing
    const targetFooterY = this.pageHeight - this.margin - footerHeight;
    this.yPosition = Math.max(this.yPosition, targetFooterY);
    
    // Professional separator line
    this.doc.setDrawColor(...this.colors.secondary);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.margin, this.yPosition, this.pageWidth - this.margin, this.yPosition);
    this.yPosition += 10;
    
    // Footer content with professional styling
    this.doc.setTextColor(...this.colors.text);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    
    wrappedFooter.forEach((line) => {
      this.doc.text(line, this.margin, this.yPosition);
      this.yPosition += 4;
    });
    
    this.yPosition += 5;
    this.doc.text(`Generated on ${new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`, this.margin, this.yPosition);
  }

  private wrapText(text: string, maxWidth: number): string[] {
    if (!text || text.trim() === '') return [''];
    
    // Sanitize text to prevent PDF rendering issues
    const sanitizedText = this.sanitizeTextForPDF(text);
    
    // Ensure maxWidth is reasonable to prevent layout issues
    const safeMaxWidth = Math.max(maxWidth, 50);
    
    const words = sanitizedText.trim().split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = this.doc.getTextWidth(testLine);
      
      if (textWidth > safeMaxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
        
        // Handle extremely long words that exceed maxWidth
        if (this.doc.getTextWidth(word) > safeMaxWidth && word.length > 15) {
          // Break very long words to prevent overflow
          const breakPoint = Math.floor(word.length * 0.7);
          lines.push(word.substring(0, breakPoint) + '-');
          currentLine = word.substring(breakPoint);
        }
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.length > 0 ? lines : [''];
  }

  private sanitizeTextForPDF(text: string): string {
    if (!text) return '';
    
    // More aggressive cleaning to prevent character spacing issues
    let cleanText = text
      // Remove or replace problematic characters that might cause rendering issues
      .replace(/[\u200B-\u200F\u2028-\u202F\u205F-\u206F]/g, '') // Remove zero-width and formatting characters
      .replace(/[\u0000-\u001F]/g, '') // Remove control characters
      .replace(/[\uFEFF]/g, '') // Remove byte order mark
      .replace(/\u00A0/g, ' ') // Replace non-breaking space with regular space
      .replace(/[\u2013\u2014]/g, '-') // Replace em/en dashes with regular dash
      .replace(/[\u2018\u2019]/g, "'") // Replace smart quotes with regular quotes
      .replace(/[\u201C\u201D]/g, '"') // Replace smart double quotes
      .replace(/\u2026/g, '...') // Replace ellipsis character
      .replace(/[\u00C0-\u017F]/g, (char) => {
        // Replace accented characters with their base equivalents
        const charMap: { [key: string]: string } = {
          'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A',
          'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
          'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
          'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
          'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
          'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
          'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O',
          'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
          'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U',
          'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
          'Ç': 'C', 'ç': 'c', 'Ñ': 'N', 'ñ': 'n'
        };
        return charMap[char] || char;
      })
      .trim();
    
    // Normalize whitespace - replace multiple spaces with single space
    cleanText = cleanText.replace(/\s+/g, ' ');
    
    // Final check - if we still have unusual characters, force ASCII-only
    if (/[^\x20-\x7E]/.test(cleanText)) {
      cleanText = cleanText.replace(/[^\x20-\x7E]/g, '');
    }
    
    return cleanText;
  }

  private checkNewPage(requiredSpace: number): boolean {
    // Improved space calculation to prevent charcoal box cut-offs
    const bottomMargin = this.margin + 25; // Increased bottom margin to prevent cut-offs
    const availableSpace = this.pageHeight - bottomMargin;
    
    // Check if current position plus required space exceeds available space
    if (this.yPosition + requiredSpace > availableSpace) {
      this.doc.addPage();
      this.yPosition = this.margin + 2; // Minimal top margin on new pages to reduce empty space
      return true; // Return true to indicate a new page was created
    }
    return false; // Return false if no new page was needed
  }

  private getPriorityColor(priority: string): [number, number, number] {
    switch (priority) {
      case 'critical': return this.colors.danger; // Sophisticated burgundy for critical
      case 'high': return this.colors.warning; // Elegant amber for high  
      case 'medium': return this.colors.info; // Premium sapphire blue for medium
      case 'low': return this.colors.muted; // Refined muted slate for low
      default: return this.colors.secondary; // Sophisticated slate gray for default
    }
  }

  private getEffortLabel(effort: string | number): string {
    const effortStr = String(effort).toLowerCase();
    switch (effortStr) {
      case '3': return 'High';
      case '2': return 'Medium';
      case '1': return 'Low';
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
      default: return String(effort);
    }
  }


  private cleanText(text: string): string {
    // Replace problematic Unicode characters with ASCII alternatives
    return text
      .replace(/📊 Page Overview/g, 'Page Overview')
      .replace(/📝 Executive Summary/g, 'Executive Summary')
      .replace(/🎯 Priority Recommendations/g, 'Priority Recommendations')
      .replace(/⚡ Quick Wins/g, 'Quick Wins')
      .replace(/✏️ Copy Suggestions/g, 'Copy Suggestions')
      .replace(/📋/g, '')
      .replace(/✅/g, '+ ')
      .replace(/⚠️/g, '! ')
      .replace(/✓/g, 'Y')
      .replace(/✗/g, 'X')
      .replace(/○/g, 'O')
      .replace(/★/g, '*')
      .replace(/●/g, '*')
      .replace(/•/g, '-');
  }

  // Helper methods for height calculations
  private calculateListHeight(items: string[], width: number): number {
    let totalHeight = 0;
    items.forEach((item) => {
      const lines = this.wrapText(item, width);
      totalHeight += lines.length * 5 + 3; // Line height + spacing
    });
    return totalHeight;
  }

  private calculateTextHeight(text: string, width: number): number {
    const lines = this.wrapText(text, width);
    return lines.length * 5;
  }

  private calculateRecommendationHeightSafe(rec: any, textWidth: number): number {
    const titleLines = this.wrapText(`${rec.title}`, textWidth); // Use consistent width
    const issueLines = this.wrapText(rec.issue || rec.currentState, textWidth);
    const solutionLines = this.wrapText(rec.solution || rec.proposedChange, textWidth);
    
    let implementationHeight = 0;
    if (rec.implementation || rec.implementationDetails || rec.how) {
      const implementationData = rec.implementation || rec.implementationDetails || rec.how;
      if (Array.isArray(implementationData)) {
        // Calculate height for bullet points with optimized spacing
        implementationData.forEach((step) => {
          const stepLines = this.wrapText(step, textWidth - 12);
          implementationHeight += (stepLines.length * 4) + 2; // Reduced line height
        });
        implementationHeight += 16; // Reduced header and spacing
      } else {
        const implementationLines = this.wrapText(implementationData, textWidth);
        implementationHeight = 16 + (implementationLines.length * 4); // Reduced spacing
      }
    }
    
    let psychologyHeight = 0;
    if (rec.psychologyBehind || rec.psychology || rec.why) {
      const psychologyData = rec.psychologyBehind || rec.psychology || rec.why;
      const psychologyLines = this.wrapText(psychologyData, textWidth);
      psychologyHeight = 16 + (psychologyLines.length * 4); // Reduced spacing
    }
    
    // Optimized base height calculation with new compact spacing
    const baseHeight = 80; // Reduced from 120
    const titleHeight = titleLines.length * 5; // Reduced from 8
    const issueHeight = (issueLines.length * 4) + 14; // Reduced line height + header
    const solutionHeight = (solutionLines.length * 4) + 14; // Reduced line height + header
    const badgeHeight = 14; // For compact badges
    
    return baseHeight + titleHeight + badgeHeight + issueHeight + solutionHeight + implementationHeight + psychologyHeight;
  }

  private calculateCopySuggestionHeightSafe(suggestion: any, textWidth: number): number {
    const sectionLines = this.wrapText(suggestion.section, textWidth); // Use consistent width
    const suggestionLines = this.wrapText(suggestion.suggestion, textWidth);
    // Significantly reduced padding for compact layout
    return 16 + (sectionLines.length * 5) + (suggestionLines.length * 4);
  }


  private calculateQuickWinHeight(win: any, textWidth: number): number {
    const titleLines = this.wrapText(win.title, textWidth); // Use consistent width
    const descriptionLines = win.description || win.rationale ? 
      this.wrapText(win.description || win.rationale, textWidth) : [];
    // Compact padding for quick wins
    return 12 + (titleLines.length * 4) + (descriptionLines.length * 3) + 8; // +8 for badges
  }

  private calculateQuickWinHeightMinimalist(win: any, textWidth: number): number {
    const titleLines = this.wrapText(win.title, textWidth); // Use consistent width
    const descriptionLines = win.description ? 
      this.wrapText(win.description, textWidth) : [];
    const rationaleLines = win.rationale ? 
      this.wrapText(win.rationale, textWidth - 5) : [];
    
    // Height calculation based on actual content spacing - compact to fit all cards
    let totalHeight = 3; // Top padding (titleY = this.yPosition + 3)
    totalHeight += (titleLines.length * 5) + 3; // Title lines + underline + spacing after title
    totalHeight += (descriptionLines.length * 4) + 3; // Description lines + spacing after description
    totalHeight += rationaleLines.length > 0 ? (rationaleLines.length * 3) + 3 : 0; // "Why:" combined with rationale lines + spacing after rationale
    totalHeight += 1; // Minimal buffer after content (metadata moved to top right)
    
    return totalHeight;
  }

  private calculateQuickWinHeightModern(win: any, textWidth: number): number {
    // Calculate height for clean design with charcoal bar
    const cleanTitle = this.sanitizeTextForPDF(win.title || '');
    const titleLines = this.wrapText(cleanTitle, textWidth - 10);
    
    const cleanDescription = this.sanitizeTextForPDF(win.description || '');
    const descriptionLines = this.wrapText(cleanDescription, textWidth - 10);
    
    const cleanRationale = this.sanitizeTextForPDF(win.rationale || '');
    const rationaleLines = this.wrapText(cleanRationale, textWidth - 10);
    
    // Height calculation for clean design with charcoal bar
    let totalHeight = 3; // Top padding
    totalHeight += (titleLines.length * 5) + 2; // Title lines + spacing
    totalHeight += (descriptionLines.length * 4) + 2; // Description lines + spacing
    totalHeight += rationaleLines.length > 0 ? 4 + (rationaleLines.length * 3) + 2 : 0; // "Why:" label + rationale lines + spacing
    totalHeight += 1; // Bottom buffer
    
    return totalHeight;
  }

  private calculateVisualAnalysisHeight(data: any, textWidth: number): number {
    let totalHeight = 8; // Base padding
    
    Object.entries(data).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        const labelLines = this.wrapText(label, textWidth - 10);
        const valueLines = this.wrapText(String(value), textWidth - 10);
        totalHeight += (labelLines.length * 3) + (valueLines.length * 3) + 5; // 5 for spacing
      }
    });
    
    return totalHeight;
  }
}

// Content optimization for large analysis results
function optimizeAnalysisForPDF(analysis: LLMAnalysis): LLMAnalysis {
  const optimized = { ...analysis };
  
  // Limit recommendations to prevent oversized PDFs
  if (optimized.recommendations && optimized.recommendations.length > 10) {
    optimized.recommendations = optimized.recommendations.slice(0, 10);
  }
  
  // Truncate very long text fields while preserving quality
  if (optimized.recommendations) {
    optimized.recommendations = optimized.recommendations.map(rec => ({
      ...rec,
      currentState: truncateText(rec.currentState, 500),
      proposedChange: truncateText(rec.proposedChange, 500),
      psychologyBehind: truncateText(rec.psychologyBehind, 400),
      testingApproach: truncateText(rec.testingApproach, 300),
      implementationDetails: Array.isArray(rec.implementationDetails) 
        ? rec.implementationDetails.slice(0, 5).map(item => truncateText(item, 100))
        : rec.implementationDetails
    }));
  }
  
  // Limit executive summary length
  if (optimized.executiveSummary && optimized.executiveSummary.length > 8) {
    optimized.executiveSummary = optimized.executiveSummary.slice(0, 8);
  }
  
  // Limit copy suggestions
  if (optimized.copySuggestions && optimized.copySuggestions.length > 6) {
    optimized.copySuggestions = optimized.copySuggestions.slice(0, 6);
  }
  
  return optimized;
}

function truncateText(text: string | undefined, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  
  // Find the last complete sentence within the limit
  const truncated = text.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastPeriod > maxLength * 0.8) {
    return truncated.substring(0, lastPeriod + 1);
  } else if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  } else {
    return truncated + '...';
  }
}

// Export function for use in popup
export async function generatePDF(analysis: LLMAnalysis, rawData: RawPageData): Promise<void> {
  try {
    // Optimize content to prevent quota issues
    const optimizedAnalysis = optimizeAnalysisForPDF(analysis);
    
    const exporter = new PDFExporter();
    await exporter.exportAudit(optimizedAnalysis, rawData, Date.now());
  } catch (error) {
    // Enhanced error handling for quota issues
    if (error instanceof Error && error.message.includes('quota')) {
      throw new Error('PDF generation failed due to large content size. This happens with very detailed analysis results. Please try again or contact support.');
    }
    throw error;
  }
}