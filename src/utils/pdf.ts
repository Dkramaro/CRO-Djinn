import { jsPDF } from 'jspdf';
import { LLMAnalysis, RawPageData } from '../types';

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

  constructor() {
    this.doc = new jsPDF('portrait', 'mm', 'a4');
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.margin = 26; // 30% larger margins
    this.yPosition = this.margin;
    this.lineHeight = 5;
    
    // Sophisticated color palette for professional documents
    this.colors = {
      primary: [88, 57, 163],       // Deep sophisticated purple
      secondary: [108, 117, 125],   // Professional gray
      success: [40, 167, 69],       // Elegant green
      warning: [255, 193, 7],       // Refined amber
      danger: [220, 53, 69],        // Subtle red
      info: [13, 110, 253],         // Professional blue
      text: [33, 37, 41],           // Rich dark text
      lightGray: [248, 249, 250],   // Clean background
      background: [255, 255, 255],  // Pure white
      accent: [102, 126, 234],      // Accent blue
      muted: [134, 142, 150]        // Muted text
    };
  }

  async exportAudit(
    analysis: LLMAnalysis,
    rawData: RawPageData,
    timestamp: number
  ): Promise<void> {
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
    
    // Quick Wins section removed as requested
    
    if (analysis.copySuggestions && analysis.copySuggestions.length > 0) {
      this.addCopySuggestionsSection(analysis.copySuggestions);
    }
    
    this.addProfessionalFooter(timestamp);
    
    // Download the PDF with clean filename
    this.doc.save(`Landing_Page_Audit_${new Date(timestamp).toISOString().split('T')[0]}.pdf`);
  }

  private addProfessionalHeader(): void {
    // Clean professional header without any branding
    this.doc.setFillColor(248, 250, 252); // Very light blue-gray
    this.doc.rect(0, 0, this.pageWidth, 40, 'F');
    
    // Add subtle gradient effect with a darker line at bottom
    this.doc.setDrawColor(220, 226, 232);
    this.doc.setLineWidth(0.5);
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
    this.doc.setFillColor(252, 253, 255); // Very light blue
    this.doc.roundedRect(this.margin - 8, this.yPosition - 6, this.pageWidth - (2 * this.margin) + 16, 35, 6, 6, 'F');
    
    // Add subtle border
    this.doc.setDrawColor(...this.colors.accent);
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(this.margin - 8, this.yPosition - 6, this.pageWidth - (2 * this.margin) + 16, 35, 6, 6, 'S');
    
    // Left side content
    // Page title
    this.doc.setTextColor(...this.colors.primary);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.text('Page:', this.margin, this.yPosition + 2);
    this.doc.setTextColor(...this.colors.text);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(11);
    this.doc.text(rawData.title || 'Untitled Page', this.margin + 28, this.yPosition + 2);
    
    // URL
    this.yPosition += 10;
    this.doc.setTextColor(...this.colors.primary);
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
    this.doc.setTextColor(...this.colors.primary);
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
    
    // Right side - Compact rating box positioned at top right
    const ratingBoxX = this.pageWidth - 55;
    const ratingBoxY = 12; // Fixed position at top of page
    
    // Professional muted color scheme for rating
    let ratingColor: [number, number, number];
    let ratingLabel: string;
    if (starRating === 3) {
      ratingColor = [46, 125, 50]; // Professional green
      ratingLabel = 'Excellent';
    } else if (starRating === 2) {
      ratingColor = [121, 134, 203]; // Muted blue-purple instead of jarring yellow
      ratingLabel = 'Good';
    } else {
      ratingColor = [156, 39, 176]; // Professional purple instead of red
      ratingLabel = 'Needs Work';
    }
    
    this.doc.setFillColor(...ratingColor);
    this.doc.roundedRect(ratingBoxX, ratingBoxY, 45, 15, 3, 3, 'F');
    
    // Compact rating content
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(7);
    this.doc.text('Rating', ratingBoxX + 2, ratingBoxY + 6);
    
    // Compact star display
    this.doc.setFontSize(8);
    this.doc.text(`${starRating}/3 Stars`, ratingBoxX + 2, ratingBoxY + 12);
    
    this.yPosition += 12; // Further reduced to bring Page Overview section closer
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
      this.yPosition += 14; // Further increased spacing to prevent overlap with reduced horizontal gap
    });
    
    this.yPosition += 7; // Reduced by 15% (8 * 0.85 = 6.8, rounded to 7)
    
    
    // Industry Context section
    if (pageSummary.industryContext) {
      this.yPosition += 10;
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
      this.yPosition += 10;
      this.addSubsectionHeader('Customer Journey');
      this.yPosition += 8;
      
      this.doc.setTextColor(...this.colors.text);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      
      const maxWidth = this.pageWidth - (2 * this.margin) - 10; // Account for numbering
      pageSummary.currentUserJourney.forEach((step: string, index: number) => {
        // Add step number
        this.doc.setTextColor(...this.colors.primary);
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
        this.yPosition += 8;
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
    this.addSectionHeaderProfessional('Strengths & Weaknesses Analysis');
    
    if (!pageSummary.keyStrengths && !pageSummary.criticalWeaknesses) {
      this.doc.setTextColor(...this.colors.text);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(11);
      this.doc.text('No strengths or weaknesses data available', this.margin, this.yPosition);
      return;
    }

    // Use full page width for better layout
    const safeColumnGap = 20;
    const totalContentWidth = this.pageWidth - (2 * this.margin) - safeColumnGap;
    const columnWidth = totalContentWidth / 2;
    const leftCol = this.margin;
    const rightCol = this.margin + columnWidth + safeColumnGap;
    
    // Calculate heights properly to prevent overlap
    const strengthsHeight = pageSummary.keyStrengths ? 
      this.calculateListHeight(pageSummary.keyStrengths, columnWidth - 26) : 0;
    const weaknessHeight = pageSummary.criticalWeaknesses ? 
      this.calculateListHeight(pageSummary.criticalWeaknesses, columnWidth - 26) : 0;
    const maxColumnHeight = Math.max(strengthsHeight, weaknessHeight) + 40; // Extra padding for full page
    
    // Strengths column with enhanced styling for dedicated page
    if (pageSummary.keyStrengths && pageSummary.keyStrengths.length > 0) {
      this.doc.setFillColor(245, 254, 245); // Very light green
      this.doc.roundedRect(leftCol - 8, this.yPosition - 5, columnWidth + 16, maxColumnHeight, 8, 8, 'F');
      
      this.doc.setDrawColor(...this.colors.success);
      this.doc.setLineWidth(1);
      this.doc.roundedRect(leftCol - 8, this.yPosition - 5, columnWidth + 16, maxColumnHeight, 8, 8, 'S');
      
      this.doc.setTextColor(...this.colors.success);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(14);
      this.doc.text('✅ Key Strengths', leftCol, this.yPosition + 12);
      
      let strengthY = this.yPosition + 28;
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      
      pageSummary.keyStrengths.forEach((strength: string, index: number) => {
        // Numbered bullet for better readability
        this.doc.setTextColor(...this.colors.success);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(`${index + 1}.`, leftCol + 5, strengthY);
        
        // Text content with proper wrapping
        this.doc.setTextColor(...this.colors.text);
        this.doc.setFont('helvetica', 'normal');
        const wrappedText = this.wrapText(strength, columnWidth - 26);
        wrappedText.forEach((line, lineIndex) => {
          this.doc.text(line, leftCol + 15, strengthY);
          if (lineIndex < wrappedText.length - 1) {
            strengthY += 6;
          }
        });
        strengthY += 12; // More spacing between items for dedicated page
      });
    }
    
    // Weaknesses column with enhanced styling for dedicated page
    if (pageSummary.criticalWeaknesses && pageSummary.criticalWeaknesses.length > 0) {
      this.doc.setFillColor(254, 245, 245); // Very light red
      this.doc.roundedRect(rightCol - 8, this.yPosition - 5, columnWidth + 16, maxColumnHeight, 8, 8, 'F');
      
      this.doc.setDrawColor(...this.colors.danger);
      this.doc.setLineWidth(1);
      this.doc.roundedRect(rightCol - 8, this.yPosition - 5, columnWidth + 16, maxColumnHeight, 8, 8, 'S');
      
      this.doc.setTextColor(...this.colors.danger);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(14);
      this.doc.text('⚠️ Critical Issues', rightCol, this.yPosition + 12);
      
      let weaknessY = this.yPosition + 28;
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      
      pageSummary.criticalWeaknesses.forEach((weakness: string, index: number) => {
        // Numbered bullet for better readability
        this.doc.setTextColor(...this.colors.danger);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(`${index + 1}.`, rightCol + 5, weaknessY);
        
        // Text content with proper wrapping
        this.doc.setTextColor(...this.colors.text);
        this.doc.setFont('helvetica', 'normal');
        const wrappedText = this.wrapText(weakness, columnWidth - 26);
        wrappedText.forEach((line, lineIndex) => {
          this.doc.text(line, rightCol + 15, weaknessY);
          if (lineIndex < wrappedText.length - 1) {
            weaknessY += 6;
          }
        });
        weaknessY += 12; // More spacing between items for dedicated page
      });
    }
    
    // Move past both columns
    this.yPosition += maxColumnHeight + 20;
  }

  private addExecutiveSummarySection(summary: string[]): void {
    this.addSectionHeaderProfessional('Executive Summary');
    
    summary.forEach((item) => {
      // Calculate proper item height with safe text width
      const safeTextWidth = this.pageWidth - (2 * this.margin) - 40; // Increased safety margin
      const itemHeight = this.calculateTextHeight(item, safeTextWidth);
      const containerHeight = itemHeight + 15; // Extra padding for container
      
      // Check for page break
      this.checkNewPage(containerHeight + 10);
      
      // Beautiful background for each summary item with proper boundaries
      this.doc.setFillColor(251, 252, 255); // Very light blue
      this.doc.roundedRect(this.margin - 8, this.yPosition - 5, this.pageWidth - (2 * this.margin) + 16, containerHeight, 4, 4, 'F');
      
      // Left accent border
      this.doc.setFillColor(...this.colors.accent);
      this.doc.rect(this.margin - 8, this.yPosition - 5, 4, containerHeight, 'F');
      
      // Store starting Y for content
      const contentStartY = this.yPosition + 5;
      
      // Bullet point
      this.doc.setTextColor(...this.colors.accent);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.text('•', this.margin + 5, contentStartY);
      
      // Content with proper wrapping and positioning
      this.doc.setTextColor(...this.colors.text);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(10);
      const wrappedText = this.wrapText(item, safeTextWidth);
      
      let textY = contentStartY;
      wrappedText.forEach((line) => {
        this.doc.text(line, this.margin + 18, textY);
        textY += 5;
      });
      
      // Move past container with safe spacing
      this.yPosition += containerHeight + 8;
    });
    
    this.yPosition += 8;
  }

  private addRecommendationsSection(recommendations: any[]): void {
    // Start a new page for Priority Recommendations
    this.addNewPage();
    
    const topRecommendations = recommendations.slice(0, 5);
    
    this.addSectionHeaderProfessional('Priority Recommendations');
    
    topRecommendations.forEach((rec, index) => {
      // Optimized text width for better space usage
      const safeTextWidth = this.pageWidth - (2 * this.margin) - 20; // Reduced from 30
      let cardHeight = this.calculateRecommendationHeightSafe(rec, safeTextWidth);
      
      // For the first recommendation only, reduce height more to prevent cut-off
      if (index === 0) {
        cardHeight = Math.max(cardHeight - 25, cardHeight * 0.85); // Reduce by 25px or 15%, whichever is smaller
      }
      
      // For first recommendation, no need to check page break since we already did above
      // For subsequent recommendations, check if they need a new page
      if (index > 0) {
        this.checkNewPage(cardHeight + 20); // Reduced buffer from 40 to 20
      }
      
      // Professional card design with optimized boundaries
      this.doc.setFillColor(252, 253, 255); // Very light blue
      this.doc.roundedRect(this.margin - 4, this.yPosition - 4, this.pageWidth - (2 * this.margin) + 8, cardHeight, 5, 5, 'F');
      
      this.doc.setDrawColor(...this.colors.accent);
      this.doc.setLineWidth(0.3);
      this.doc.roundedRect(this.margin - 4, this.yPosition - 4, this.pageWidth - (2 * this.margin) + 8, cardHeight, 5, 5, 'S');
      
      // Recommendation title with optimized spacing
      this.doc.setTextColor(...this.colors.primary);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(11);
      const titleText = `${index + 1}. ${rec.title}`;
      const maxTitleWidth = this.pageWidth - (2 * this.margin) - 15; // Optimized width
      const wrappedTitle = this.wrapText(titleText, maxTitleWidth);
      
      let titleY = this.yPosition + 3; // Reduced spacing
      wrappedTitle.forEach((line) => {
        this.doc.text(line, this.margin, titleY);
        titleY += 5; // Reduced line height
      });
      this.yPosition = titleY + 8; // Reduced spacing
      
      // Compact badges with professional styling
      this.doc.setFontSize(7);
      this.doc.setFont('helvetica', 'bold');
      
      // Priority badge - more compact
      const priorityColor = this.getPriorityColor(rec.priority);
      this.doc.setFillColor(...priorityColor);
      this.doc.roundedRect(this.margin, this.yPosition, 32, 8, 2, 2, 'F');
      this.doc.setTextColor(255, 255, 255);
      this.doc.text(rec.priority.toUpperCase(), this.margin + 2, this.yPosition + 5);
      
      // Effort badge - more compact
      this.doc.setFillColor(...this.colors.info);
      this.doc.roundedRect(this.margin + 36, this.yPosition, 36, 8, 2, 2, 'F');
      this.doc.setTextColor(255, 255, 255);
      this.doc.text(`EFFORT: ${rec.effort}`, this.margin + 38, this.yPosition + 5);
      
      // Timeline badge - more compact
      if (rec.timeline) {
        this.doc.setFillColor(...this.colors.muted);
        this.doc.roundedRect(this.margin + 76, this.yPosition, 40, 8, 2, 2, 'F');
        this.doc.setTextColor(255, 255, 255);
        this.doc.text(rec.timeline.toUpperCase(), this.margin + 78, this.yPosition + 5);
      }
      
      this.yPosition += 14; // Reduced from 20
      
      // Issue section with optimized spacing
      this.doc.setTextColor(...this.colors.danger);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(8);
      this.doc.text('ISSUE:', this.margin, this.yPosition);
      this.yPosition += 8; // Reduced from 10
      
      this.doc.setTextColor(...this.colors.text);
      this.doc.setFont('helvetica', 'normal');
      const issueText = this.wrapText(rec.issue || rec.currentState, safeTextWidth);
      issueText.forEach((line) => {
        this.doc.text(line, this.margin + 6, this.yPosition); // Reduced indent from 8
        this.yPosition += 4; // Reduced from 5
      });
      
      this.yPosition += 6; // Reduced from 8
      
      // Solution section with optimized spacing
      this.doc.setTextColor(...this.colors.success);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(8);
      this.doc.text('SOLUTION:', this.margin, this.yPosition);
      this.yPosition += 8; // Reduced from 10
      
      this.doc.setTextColor(...this.colors.text);
      this.doc.setFont('helvetica', 'normal');
      const solutionText = this.wrapText(rec.solution || rec.proposedChange, safeTextWidth);
      solutionText.forEach((line) => {
        this.doc.text(line, this.margin + 6, this.yPosition); // Reduced indent from 8
        this.yPosition += 4; // Reduced from 5
      });
      
      this.yPosition += 6; // Reduced from 8
      
      // How to implement section (if available)
      if (rec.implementation || rec.implementationDetails || rec.how) {
        this.doc.setTextColor(...this.colors.info);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(9);
        this.doc.text('HOW TO IMPLEMENT:', this.margin, this.yPosition);
        this.yPosition += 10;
        
        this.doc.setTextColor(...this.colors.text);
        this.doc.setFont('helvetica', 'normal');
        
        const implementationData = rec.implementation || rec.implementationDetails || rec.how;
        if (Array.isArray(implementationData)) {
          // Handle array of implementation steps
          implementationData.forEach((step) => {
            // Bullet point
            this.doc.setTextColor(...this.colors.info);
            this.doc.setFont('helvetica', 'bold');
            this.doc.text('-', this.margin + 8, this.yPosition);
            
            // Step text
            this.doc.setTextColor(...this.colors.text);
            this.doc.setFont('helvetica', 'normal');
            const stepText = this.wrapText(step, safeTextWidth - 15);
            stepText.forEach((line) => {
              this.doc.text(line, this.margin + 15, this.yPosition);
              this.yPosition += 5;
            });
            this.yPosition += 2;
          });
        } else {
          // Handle string implementation
          const implementationText = this.wrapText(implementationData, safeTextWidth);
          implementationText.forEach((line) => {
            this.doc.text(line, this.margin + 8, this.yPosition);
            this.yPosition += 5;
          });
        }
        this.yPosition += 8;
      }
      
      // Why this works section (if available)
      if (rec.psychologyBehind || rec.psychology || rec.why) {
        this.doc.setTextColor(...this.colors.accent);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(8);
        this.doc.text('WHY THIS WORKS:', this.margin, this.yPosition);
        this.yPosition += 8; // Reduced from 10
        
        this.doc.setTextColor(...this.colors.text);
        this.doc.setFont('helvetica', 'normal');
        const psychologyData = rec.psychologyBehind || rec.psychology || rec.why;
        const psychologyText = this.wrapText(psychologyData, safeTextWidth);
        psychologyText.forEach((line) => {
          this.doc.text(line, this.margin + 6, this.yPosition); // Reduced indent from 8
          this.yPosition += 4; // Reduced from 5
        });
        this.yPosition += 6; // Reduced from 8
      }
      
      // Add spacing between recommendation cards
      this.yPosition += 12; // Optimized spacing between cards
    });
    
    this.yPosition += 15;
  }

  private addCopySuggestionsSection(suggestions: any[]): void {
    // Reduced spacing before copy suggestions
    this.yPosition += 15;
    this.addSectionHeaderProfessional('Copy Suggestions');
    
    suggestions.forEach((suggestion) => {
      // Calculate proper card height with safe text width
      const safeTextWidth = this.pageWidth - (2 * this.margin) - 20;
      const cardHeight = this.calculateCopySuggestionHeightSafe(suggestion, safeTextWidth);
      
      this.checkNewPage(cardHeight + 8);
      
      // Light blue card for copy suggestions with compact boundaries
      this.doc.setFillColor(250, 253, 255); // Very light blue
      this.doc.roundedRect(this.margin - 6, this.yPosition - 3, this.pageWidth - (2 * this.margin) + 12, cardHeight, 4, 4, 'F');
      
      this.doc.setDrawColor(...this.colors.info);
      this.doc.setLineWidth(0.3);
      this.doc.roundedRect(this.margin - 6, this.yPosition - 3, this.pageWidth - (2 * this.margin) + 12, cardHeight, 4, 4, 'S');
      
      // Store starting position for proper container sizing
      const cardStartY = this.yPosition;
      
      // Section name with compact spacing
      this.doc.setTextColor(...this.colors.info);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      const maxSectionWidth = this.pageWidth - (2 * this.margin) - 15;
      const wrappedSection = this.wrapText(suggestion.section, maxSectionWidth);
      
      let sectionY = this.yPosition + 3;
      wrappedSection.forEach((line) => {
        this.doc.text(line, this.margin, sectionY);
        sectionY += 5;
      });
      this.yPosition = sectionY + 4;
      
      // Suggestion text with compact boundaries
      this.doc.setTextColor(...this.colors.text);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9);
      const suggestionText = this.wrapText(suggestion.suggestion, safeTextWidth);
      suggestionText.forEach((line) => {
        this.doc.text(line, this.margin + 6, this.yPosition);
        this.yPosition += 4;
      });
      
      // Ensure we move past the entire card with minimal spacing
      const cardEndY = cardStartY + cardHeight + 4;
      this.yPosition = Math.max(this.yPosition + 2, cardEndY);
      this.yPosition += 3; // Minimal spacing between cards
    });
    
    this.yPosition += 8;
  }

  private addSectionHeaderProfessional(title: string): void {
    this.checkNewPage(50);
    
    this.yPosition += 15;
    
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

  private addProfessionalFooter(timestamp: number): void {
    // Add some space before footer
    this.yPosition += 20;
    
    // Professional separator line
    this.doc.setDrawColor(...this.colors.secondary);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.margin, this.yPosition, this.pageWidth - this.margin, this.yPosition);
    this.yPosition += 10;
    
    // Footer content with professional styling
    this.doc.setTextColor(...this.colors.muted);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    
    const footerText = 'This audit provides actionable insights for improving landing page conversion rates. ' +
                      'Recommendations are based on conversion optimization best practices and user experience principles.';
    const wrappedFooter = this.wrapText(footerText, this.pageWidth - (2 * this.margin));
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
    
    // Ensure maxWidth is reasonable to prevent layout issues
    const safeMaxWidth = Math.max(maxWidth, 50);
    
    const words = text.trim().split(' ');
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
    
    return lines;
  }

  private checkNewPage(requiredSpace: number): void {
    // Improved space calculation to prevent purple box cut-offs
    const bottomMargin = this.margin + 15; // Consistent bottom margin
    const availableSpace = this.pageHeight - bottomMargin;
    
    // Check if current position plus required space exceeds available space
    if (this.yPosition + requiredSpace > availableSpace) {
      this.doc.addPage();
      this.yPosition = this.margin + 2; // Minimal top margin on new pages to reduce empty space
    }
  }

  private getPriorityColor(priority: string): [number, number, number] {
    switch (priority) {
      case 'critical': return this.colors.danger;
      case 'high': return this.colors.warning;
      case 'medium': return this.colors.info;
      case 'low': return this.colors.success;
      default: return this.colors.secondary;
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
    const titleLines = this.wrapText(`${rec.title}`, this.pageWidth - (2 * this.margin) - 15);
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
    const sectionLines = this.wrapText(suggestion.section, this.pageWidth - (2 * this.margin) - 15);
    const suggestionLines = this.wrapText(suggestion.suggestion, textWidth);
    // Significantly reduced padding for compact layout
    return 16 + (sectionLines.length * 5) + (suggestionLines.length * 4);
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