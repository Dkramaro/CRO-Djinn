// Raw page data - what we actually send to AI
export interface RawPageData {
  url: string;
  title: string;
  metaDescription: string;
  fullHTML: string;
  fullTextContent: string;
  structuredContent: {
    headings: any[];
    interactiveElements: InteractiveElement[];
    forms: any[];
    images: any[];
    lists: any[];
    videos: any[];
    interactive: any[];
    sections: any[];
  };
  pageMetadata: any;
  timestamp: number;
}

// Unified interactive element type
export interface InteractiveElement {
  text: string;
  elementType: 'button' | 'link';
  tag: string;
  href: string | null;
  type: string | null;
  position: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  styles: {
    backgroundColor: string;
    color: string;
    fontSize: string;
    fontWeight: string;
    textDecoration: string;
    display: string;
  };
  attributes: {
    class: string;
    id: string;
    target: string | null;
    ariaLabel: string | null;
  };
  isAboveFold: boolean;
  index: number;
}

// Legacy interface - keeping for backwards compatibility during transition
export interface PageSummary {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  ctas: CTAElement[];
  forms: FormData[];
  contactSignals: ContactSignals;
  pricingSignals: PricingSignals;
  trustSignals: TrustSignals;
  performanceHints: PerformanceHints;
  textSample: string;
  primaryConversionGuess: string;
  contentStructure: ContentStructure;
  visualIssues: VisualIssues;
  uxIssues: UXIssues;
  performanceMetrics: PerformanceMetrics;
  visualMetrics: VisualMetrics;
  industryContext: IndustryContext;
  userJourney: UserJourneyAnalysis;
  // Enhanced business analysis
  businessMetrics: BusinessMetrics;
  marketingEffectiveness: MarketingEffectiveness;
  conversionBarriers: ConversionBarrier[];
  competitivePositioning: CompetitivePositioning;
}

export interface CTAElement {
  text: string;
  visible: boolean;
  selector: string;
  isPrimary: boolean;
  hasStrongContrast: boolean;
  size: 'small' | 'medium' | 'large';
  position: 'above-fold' | 'below-fold';
  pixelSize?: { width: number; height: number };
  backgroundColor?: string;
  textColor?: string;
  contrastRatio?: number;
  distanceFromTop?: number;
  // Enhanced business-focused properties
  visualProminence: number; // 0-100 score for how much this stands out
  marketingMessage: 'benefit' | 'feature' | 'action' | 'generic'; // Type of messaging
  urgencyLevel: 'none' | 'low' | 'medium' | 'high'; // Urgency indicators
  conversionIntent: 'primary' | 'secondary' | 'navigation' | 'social'; // Business purpose
  competitionLevel: number; // How many other CTAs compete for attention
  proximityToValueProp: number; // Distance to main value proposition in pixels
}

export interface FormData {
  requiredFields: number;
  totalFields: number;
}

export interface ContactSignals {
  phoneNumbers: number;
  emailLinks: number;
  chatWidget: boolean;
}

export interface PricingSignals {
  currencyMatches: string[];
}

export interface TrustSignals {
  reviewsCount: number;
  ratingsPresent: boolean;
  testimonialsCount: number;
  guaranteePresent: boolean;
  warrantyPresent: boolean;
  refundPolicyPresent: boolean;
  privacyPolicyPresent: boolean;
  termsPresent: boolean;
  contactSectionVisible: boolean;
}

export interface PerformanceHints {
  imageCount: number;
  largeImageCount: number;
  webFontCount: number;
  heavyInlineStyles: boolean;
}

export interface ContentStructure {
  hasValueProp: boolean;
  valueProposition: string;
  hasUrgency: boolean;
  urgencyText: string;
  paragraphCount: number;
  averageParagraphLength: number;
  hasBulletPoints: boolean;
  readabilityIssues: string[];
}

export interface VisualIssues {
  multiplePrimaryCTAs: boolean;
  primaryCTACount: number;
  lowContrastElements: number;
  missingAltText: number;
  inconsistentSpacing: boolean;
  poorTypographyHierarchy: boolean;
}

export interface UXIssues {
  hasPopups: boolean;
  cookieBannerIntrusive: boolean;
  navigationComplexity: 'simple' | 'moderate' | 'complex';
  mobileOptimized: boolean;
  loadingIndicators: boolean;
  formValidationIssues: string[];
}

export interface PerformanceMetrics {
  pageLoadTime: number; // milliseconds
  timeToFirstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  firstInputDelay: number;
  imageOptimizationScore: number; // 0-100
  totalPageSize: number; // bytes
  criticalResourcesBlocking: number;
}

export interface VisualMetrics {
  viewportWidth: number;
  viewportHeight: number;
  aboveFoldHeight: number;
  primaryCTACoordinates: { x: number; y: number; width: number; height: number }[];
  contrastIssues: ContrastIssue[];
  fontSizes: number[];
  colorPalette: string[];
  whitespaceRatio: number; // percentage of page that is whitespace
}

export interface ContrastIssue {
  element: string;
  backgroundColor: string;
  textColor: string;
  contrastRatio: number;
  wcagLevel: 'fail' | 'aa' | 'aaa';
}

export interface IndustryContext {
  industry: string; // e.g., 'healthcare', 'saas', 'ecommerce'
  subIndustry: string; // e.g., 'mental-health', 'telemedicine'
  complianceRequirements: string[]; // e.g., ['HIPAA', 'FDA']
  trustFactorsNeeded: string[]; // industry-specific trust elements
  conversionBenchmarks: {
    averageConversionRate: number;
    highPerformingRate: number;
    averageCostPerClick: number;
  };
  psychologicalFactors: string[]; // industry-specific user psychology
}

export interface UserJourneyAnalysis {
  conversionFunnelSteps: FunnelStep[];
  potentialDropOffPoints: string[];
  userIntentSignals: string[];
  emotionalJourney: EmotionalState[];
  decisionFactors: DecisionFactor[];
  objectionPoints: string[];
}

export interface FunnelStep {
  step: string;
  description: string;
  barriers: string[];
  optimizationOpportunities: string[];
}

export interface EmotionalState {
  stage: string;
  emotion: string;
  triggers: string[];
  responses: string[];
}

export interface DecisionFactor {
  factor: string;
  importance: 'high' | 'medium' | 'low';
  currentEffectiveness: 'strong' | 'weak' | 'missing';
  recommendations: string[];
}

// Professional CRO Analysis types
export interface LLMAnalysis {
  starRating: 1 | 2 | 3;
  pageSummary?: PageAnalysisSummary;
  conversionAnalysis?: ConversionAnalysis;
  currentStateAnalysis?: CurrentStateAnalysis;
  recommendations?: ProfessionalRecommendation[];
  quickWins?: QuickWin[];
  topFixes?: TopFix[];
  implementationRoadmap?: ImplementationStep[];
  psychologyInsights?: PsychologyInsight[];
  competitiveBenchmarks?: CompetitiveBenchmark[];
  visualCROAnalysis?: VisualCROAnalysis;
  executiveSummary: string[];
  checklist: ChecklistItem[];
  copySuggestions?: CopySuggestion[];
}

export interface PageAnalysisSummary {
  businessType: string;
  primaryConversionGoal: string;
  secondaryGoals: string[];
  targetAudience: string;
  valueProposition: string;
  currentUserJourney: string[];
  keyStrengths: string[];
  criticalWeaknesses: string[];
}

export interface ConversionAnalysis {
  conversionPath: ConversionPathStep[];
  dropOffPoints: DropOffPoint[];
  frictionAnalysis: FrictionPoint[];
  trustFactors: TrustFactor[];
  urgencyFactors: UrgencyFactor[];
}

export interface ConversionPathStep {
  step: string;
  description: string;
  currentEffectiveness: 'strong' | 'moderate' | 'weak' | 'missing';
  optimizationOpportunity: string;
}

export interface DropOffPoint {
  location: string;
  reason: string;
  impact: 'high' | 'medium' | 'low';
  solution: string;
}

export interface FrictionPoint {
  element: string;
  issue: string;
  userImpact: string;
  solution: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface TrustFactor {
  element: string;
  currentState: 'strong' | 'moderate' | 'weak' | 'missing';
  recommendation: string;
  impact: string;
}

export interface UrgencyFactor {
  element: string;
  currentLevel: 'high' | 'medium' | 'low' | 'none';
  recommendation: string;
  psychologyBehind: string;
}

export interface CurrentStateAnalysis {
  headlines: HeadlineAnalysis[];
  callsToAction: CTAAnalysis[];
  forms: FormAnalysis[];
  socialProof: SocialProofAnalysis;
  messaging: MessagingAnalysis;
  visualHierarchy: VisualHierarchyAnalysis;
}

export interface HeadlineAnalysis {
  text: string;
  position: string;
  effectiveness: number; // 1-10
  issues: string[];
  improvements: string[];
  psychologyNotes: string[];
}

export interface CTAAnalysis {
  text: string;
  position: string;
  visibility: number; // 1-10
  effectiveness: number; // 1-10
  issues: string[];
  improvements: string[];
  conversionPotential: string;
}

export interface FormAnalysis {
  fieldCount: number;
  requiredFields: number;
  friction: 'low' | 'medium' | 'high';
  abandonmentRisk?: string;
  optimizations: string[];
}

export interface MessagingAnalysis {
  clarity: number; // 1-10
  persuasiveness: number; // 1-10
  benefitsFocus: number; // 1-10
  emotionalAppeal: number; // 1-10
  improvements: string[];
}

export interface VisualHierarchyAnalysis {
  effectiveness: number; // 1-10
  issues: string[];
  improvements: string[];
  ctaProminence: string;
}

export interface ProfessionalRecommendation {
  title: string;
  category: 'messaging' | 'design' | 'psychology' | 'trust' | 'friction' | 'cta' | 'form';
  priority: 'critical' | 'high' | 'medium' | 'low';
  currentState: string;
  proposedChange: string;
  implementationDetails: string[];
  expectedImpact: {
    conversionLift: string;
    revenueImpact: string;
    userExperience: string;
  };
  psychologyBehind: string;
  testingApproach: string;
  effort: number; // 1-5
  impact: number; // 1-5
  timeline: string;
}

export interface ImplementationStep {
  phase: number;
  title: string;
  description: string;
  tasks: string[];
  timeline: string;
  resources: string[];
  successMetrics: string[];
  dependencies: string[];
}

export interface PsychologyInsight {
  principle: string;
  currentApplication: 'strong' | 'moderate' | 'weak' | 'missing';
  opportunity: string;
  implementation: string;
  expectedBehaviorChange: string;
}

export interface CompetitiveBenchmark {
  aspect: string;
  industryStandard: string;
  currentState: string;
  gapAnalysis: string;
  recommendation: string;
}

export interface TopFix {
  title: string;
  why: string;
  how: string;
  impact: number; // 1-5
  effort: number; // 1-5
  timeline?: string; // e.g., "2-3 hours", "1-2 days"
  psychology?: string; // conversion psychology reasoning
}

export interface QuickWin {
  title: string;
  description?: string;
  rationale?: string;
  effort: number; // 1-5
  timeline: string; // e.g., "Same day", "2-3 days"
}

export interface ChecklistItem {
  area: string;
  result: 'pass' | 'fail' | 'neutral';
  note: string;
}

export interface CopySuggestion {
  section: string;
  suggestion: string;
}

export interface VisualCROAnalysis {
  visualFlow: {
    eyeFlowPath: string;
    flowScore: number;
    guidesToCTA: boolean;
    distractions: string[];
  };
  colorContrast: {
    ctaContrast: string;
    readability: string;
    emotionalResponse: string;
    contrastScore: number;
  };
  criticalIssue: {
    problem: string;
    solution: string;
    impact: string;
    urgency: string;
  };
}

// Storage types
export interface CachedAudit {
  analysis: LLMAnalysis;
  rawData: RawPageData;
  timestamp: number;
  modelName: string;
}

export interface ExtensionSettings {
  provider: 'openai' | 'gemini';
  openaiApiKey: string;
  geminiApiKey: string;
  openaiModel: string;
  geminiModel: string;
  fullPageScreenshot: boolean;
}

// UI state types
export interface AnalysisState {
  status: 'idle' | 'scraping' | 'analyzing' | 'ready' | 'error';
  analysis?: LLMAnalysis;
  rawData?: RawPageData;
  fromCache?: boolean;
  error?: string;
  progress?: string;
}

// Enhanced business-focused analysis types
export interface BusinessMetrics {
  conversionFunnelClarity: number; // 0-100 score
  valuePropositionStrength: number; // 0-100 score
  trustSignalEffectiveness: number; // 0-100 score
  urgencyImplementation: number; // 0-100 score
  ctaHierarchyScore: number; // 0-100 score
  messageConsistency: number; // 0-100 score
  competitiveAdvantage: number; // 0-100 score
}

export interface MarketingEffectiveness {
  headlineImpact: HeadlineAnalysis;
  valueProposition: ValuePropositionAnalysis;
  socialProofUsage: SocialProofAnalysis;
  urgencyTactics: UrgencyAnalysis;
  offerClarity: OfferAnalysis;
  riskReduction: RiskReductionAnalysis;
}

export interface HeadlineAnalysis {
  clarity: number; // 0-100
  benefitFocus: boolean;
  emotionalAppeal: number; // 0-100
  uniqueness: number; // 0-100
  specificityLevel: 'vague' | 'specific' | 'very-specific';
  improvements: string[];
}

export interface ValuePropositionAnalysis {
  strength: number; // 0-100
  placement: 'hero' | 'secondary' | 'buried' | 'missing';
  clarity: number; // 0-100
  differentiation: number; // 0-100
  benefitCount: number;
  featureCount: number;
  benefitToFeatureRatio: number;
  improvements: string[];
}

export interface SocialProofAnalysis {
  types: ('testimonials' | 'reviews' | 'numbers' | 'logos' | 'certifications')[];
  placement: 'prominent' | 'secondary' | 'buried';
  credibility: number; // 0-100
  quantity: number;
  recency: 'recent' | 'dated' | 'unknown';
  improvements: string[];
}

export interface UrgencyAnalysis {
  hasUrgency: boolean;
  urgencyType: 'scarcity' | 'time-limited' | 'demand' | 'none';
  believability: number; // 0-100
  placement: 'prominent' | 'subtle' | 'missing';
  improvements: string[];
}

export interface OfferAnalysis {
  hasOffer: boolean;
  offerType: 'discount' | 'bonus' | 'guarantee' | 'trial' | 'consultation' | 'none';
  valueClarity: number; // 0-100
  prominence: number; // 0-100
  improvements: string[];
}

export interface RiskReductionAnalysis {
  guarantees: string[];
  refundPolicy: boolean;
  testimonials: number;
  certifications: string[];
  contactVisibility: number; // 0-100
  trustScore: number; // 0-100
  improvements: string[];
}

export interface ConversionBarrier {
  type: 'visual' | 'content' | 'trust' | 'friction' | 'clarity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string; // Business impact description
  solution: string; // Specific solution
  effortLevel: 'quick-fix' | 'moderate' | 'major-redesign';
}

export interface CompetitivePositioning {
  differentiationStrength: number; // 0-100
  competitiveAdvantages: string[];
  marketPosition: 'premium' | 'value' | 'economy' | 'unclear';
  uniqueSellingPoints: string[];
  commoditization: number; // 0-100 (higher = more commoditized)
  improvements: string[];
}
