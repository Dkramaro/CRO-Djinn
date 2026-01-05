import { ExtensionSettings, RawPageData } from '../types';
import { DEBUG, safeLog } from '../config/debug';
import { sanitizeErrorMessage } from '../utils/security';

// Type guard for chrome APIs
declare const chrome: any;

/**
 * Offscreen document - Only responds to background script requests
 * NEVER self-triggers or calls LLM independently
 * Background script is the single source of truth for all analysis
 */

console.log('🔧 [Offscreen] Document loaded at:', location.href);
console.log('🔧 [Offscreen] chrome object available:', !!chrome);
console.log('🔧 [Offscreen] chrome.storage available:', !!chrome?.storage);
console.log('🔧 [Offscreen] chrome.storage.local available:', !!chrome?.storage?.local);
console.log('🔧 [Offscreen] chrome.runtime available:', !!chrome?.runtime);

// Singleton initialization guard - Friend's Pattern
if (!globalThis.__OFFSCREEN_INIT__) {
  globalThis.__OFFSCREEN_INIT__ = true;

  console.log(`🔧 [Offscreen] Document loading at: ${location.href}`);

  // Add a small delay to allow chrome APIs to initialize
  setTimeout(async () => {
    console.log('🔧 [Offscreen] Delayed check - chrome.storage.local available:', !!chrome?.storage?.local);
    
    // Check if chrome.storage is available (it usually isn't in offscreen documents)
    if (chrome?.storage?.local) {
      console.log('✅ [Offscreen] chrome.storage.local is directly available');
      initializeOffscreen();
    } else {
      console.log('📡 [Offscreen] chrome.storage not available - using proxy mode through background script');
      console.log('🔧 [Offscreen] Available chrome APIs:', chrome ? Object.keys(chrome) : 'chrome is undefined');
      
      // This is normal for offscreen documents - they use background script for storage
      initializeOffscreen();
    }
  }, 100);
}

function initializeOffscreen() {
  console.log('🔧 [Offscreen] Document initializing with direct storage pattern...');

  // Message handler for RUN_ANALYSIS - Friend's exact pattern
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "RUN_ANALYSIS") {
      console.log(`[Offscreen] Received RUN_ANALYSIS:`, msg.payload);
      
      // Fire and forget - run analysis in background
      runAnalysis(msg.payload).then(
        () => {
          console.log(`✅ [Offscreen] Analysis completed successfully for ${msg.payload?.key}`);
        },
        async (err) => {
          const key = msg.payload?.key || "unknown";
          console.error(`❌ [Offscreen] Analysis failed for ${key}:`, err);
          
          // Write failure state so popup can render it via proxy
          try {
            await chrome.runtime.sendMessage({
              type: "STORAGE_SET",
              key: `job:${key}`,
              data: { 
                key, 
                state: "failed", 
                updatedAt: Date.now(), 
                error: String(err?.message || err),
                failedAt: Date.now() 
              }
            });
          } catch (storageErr) {
            console.error(`❌ [Offscreen] Failed to write error state to storage:`, storageErr);
          }
        }
      );
      
      // Acknowledge immediately and return
      sendResponse({ ok: true });
      return true;
    }
    
    // Image compression handler
    if (msg?.type === "COMPRESS_IMAGE") {
      console.log('[Offscreen] Received COMPRESS_IMAGE request', {
        dataLength: msg.base64Data?.length || 0,
        targetRatio: msg.targetRatio || 0.35
      });
      
      // Handle async compression
      (async () => {
        try {
          if (!msg.base64Data || typeof msg.base64Data !== 'string') {
            throw new Error('Invalid base64Data provided');
          }
          
          const compressedData = await compressScreenshotInOffscreen(
            msg.base64Data, 
            msg.targetRatio || 0.5 // Default to 50% of original size for balanced compression
          );
          
          console.log('[Offscreen] Image compression successful');
          sendResponse({ ok: true, compressedData });
        } catch (error) {
          console.error('[Offscreen] Image compression failed:', error);
          console.warn('[Offscreen] Falling back to original image data');
          // Fallback: return original image data rather than failing completely
          sendResponse({ ok: false, error: String(error), compressedData: msg.base64Data });
        }
      })();
      
      return true;
    }
    
    // Test connection handler
    if (msg?.type === "TEST_CONNECTION") {
      console.log('[Offscreen] Received TEST_CONNECTION');
      sendResponse({ ok: true, message: 'Offscreen document ready' });
      return true;
    }
    
    // Legacy support - ignore other message types
    if (msg.type === 'OFFSCREEN_ANALYZE') {
      console.warn('[Offscreen] Ignoring legacy OFFSCREEN_ANALYZE message');
      sendResponse({ success: false, error: 'Use RUN_ANALYSIS instead' });
      return true;
    }

    // Return false to let other handlers process unknown messages
    return false;
  });

  console.log('✅ [Offscreen] Document ready for RUN_ANALYSIS requests');
}

/**
 * Run LLM analysis with screenshots - only called by background script
 */
async function runLLMAnalysisWithScreenshots(rawData: RawPageData, settings: ExtensionSettings, screenshots: string[]): Promise<any> {
  const analysisId = `llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`🤖 [${analysisId}] Starting LLM analysis with ${screenshots.length} screenshots`);
  
  // Build the analysis prompt
  const systemMessage = `You are a $10,000/day Senior Conversion Rate Optimization Consultant with 20+ years of experience across ALL industries who avoids redundant repitition of recommendations. You've optimized pages for Fortune 500 companies and generated millions in additional revenue through conversion optimization.

YOUR EXPERTISE AREAS:
- Consumer Psychology & Behavioral Economics across different industries and purchase types
- A/B Testing & Statistical Analysis for various business models
- UX/UI Conversion Design tailored to specific page types and user journeys
- Industry-Specific Copywriting & Messaging Strategy
- Trust & Credibility Optimization per business type
- Performance Optimization for different conversion goals

WRITING STYLE (MANDATORY):
- Write complete, clear sentences. Do not skip articles (the, a, an) or connectors that aid clarity.
- No filler words: "essentially", "basically", "in order to", "it should be noted", "it is important"
- No paragraphs anywhere. Use bullets and 1-2 sentence explanations.
- Context-appropriate length:
  * Issue/Solution/Why fields: 25-35 words for complete explanation
  * Quick Wins/Copy Suggestions: Under 20 words, punchy
  * Executive Summary bullets: Under 25 words each
  * Customer Journey steps: Under 30 words each

MANDATORY OUTPUT REQUIREMENTS (NON-NEGOTIABLE):
Your analysis MUST include:
- EXACTLY 5 Priority Recommendations. Not 4. Not 6. Exactly 5.
- EXACTLY 3-5 Quick Wins (minimum 3, maximum 5) - no exceptions
- EXACTLY 4-6 Copy Suggestions covering different page sections (hero, CTA, social proof, etc.)
These counts are REQUIRED. Providing fewer items is a critical failure.

CRITICAL FIRST STEP - CONTEXT ANALYSIS:
Before making ANY recommendations, you MUST first analyze and determine:

1. BUSINESS TYPE & INDUSTRY: Identify the specific business type (SaaS, E-commerce, Lead Generation, B2B Services, Healthcare, Financial Services, Education, etc.) and apply industry-specific CRO knowledge and benchmarks.

2. PAGE TYPE: Determine what type of page this is:
   - Homepage (brand introduction, multiple conversion paths)
   - Product/Service Page (specific offering focus)
   - Landing Page (single conversion goal, campaign-driven)
   - Pricing Page (purchase decision, plan comparison)
   - About/Contact Page (trust building, lead generation)
   - Blog/Content Page (engagement, nurturing)

3. PURCHASE BEHAVIOR TYPE: Assess whether this is:
   - HIGH-CONSIDERATION PURCHASE: Complex, expensive, or high-risk decisions requiring extensive research, social proof, detailed information, and trust building (B2B software, expensive products, professional services, medical/legal services).
   - IMPULSE/LOW-CONSIDERATION PURCHASE: Quick, low-risk decisions that benefit from urgency, scarcity, and streamlined checkout (consumer products, low-cost items, entertainment, basic services).

INDUSTRY-SPECIFIC ANALYSIS REQUIREMENTS:
- Apply industry-specific conversion psychology and benchmarks.
- Reference industry-standard conversion rates and best practices.
- Use terminology and value propositions relevant to that industry.
- Consider industry-specific trust signals and objections.
- Apply appropriate urgency and scarcity tactics for that market.

PAGE TYPE-SPECIFIC ANALYSIS:
- Tailor recommendations to the page's primary conversion goal.
- Consider the user's mindset and intent when landing on this page type.
- Apply appropriate conversion frameworks for the page type.
- Adjust recommendation priorities based on page function.

PURCHASE BEHAVIOR ADAPTATION:
- For HIGH-CONSIDERATION: Focus on trust building, detailed information, social proof, risk reduction, consultative approach, longer-form content, multiple touchpoints.
- For IMPULSE/LOW-CONSIDERATION: Focus on simplicity, speed, urgency, clear CTAs, streamlined process, immediate gratification.

CUSTOMER JOURNEY MAPPING REQUIREMENTS (Behavioral Attention Analysis):
Map how visitors experience the page - what grabs their attention, what actions they can take, and where they might get stuck.

STRUCTURE (5-7 steps, written for MARKETERS not UX experts):
1. FIRST LOOK: What grabs attention immediately? What can they click? What might confuse them?
2. SCANNING: How do they scan the page? What competes for attention?
3. SCROLLING: What makes them scroll down? What might make them leave instead?
4. EXPLORING: What content pulls them in below the fold? Where might they get distracted?
5. BUILDING TRUST: When do they see proof/credibility? Is it too late?
6. TAKING ACTION: Is the final CTA clear? What's missing?

FORMAT RULES:
- Write in plain English that a marketing manager would understand
- NO jargon like "F-pattern", "cognitive load", "visual hierarchy"
- Each step: 1-2 short sentences (max 25 words total)
- Focus on: What they SEE → What they can DO → What might STOP them
- Example: "FIRST LOOK: Big headline about lease management grabs attention. Demo and Pricing buttons visible. But three product cards pull focus away from the main action."

ANALYSIS DEPTH REQUIRED: Your analysis must be comprehensive enough to justify a $10,000+ consulting fee. Every recommendation must be:
1. Backed by industry-specific conversion psychology principles.
2. Tailored to the identified page type and user intent.
3. Appropriate for the purchase behavior type (high vs low consideration).
4. Include detailed step-by-step implementation instructions in the "implementation" array.
5. Prioritized by conversion impact potential for this specific context.
6. Supported by industry-specific benchmarks and best practices.

IMPLEMENTATION REQUIREMENT: Every recommendation MUST include 3-5 specific, actionable implementation steps that they can execute immediately.

OUTPUT QUALITY: This analysis should read like a professional consulting report that demonstrates deep understanding of the specific industry, page type, and customer psychology.`;

  const userMessage = `COMPREHENSIVE CRO AUDIT REQUEST: Conduct a detailed, professional-grade conversion optimization analysis worth $10,000+ in consulting value.

=== PAGE CONTEXT ===
PAGE TITLE: ${rawData.title}
URL: ${rawData.url}
META DESCRIPTION: ${rawData.metaDescription}
VIEWPORT: ${rawData.pageMetadata.viewport.width}x${rawData.pageMetadata.viewport.height}
PAGE HEIGHT: ${rawData.pageMetadata.viewport.scrollHeight}px
MOBILE OPTIMIZED: ${rawData.pageMetadata.viewportMeta.includes('width=device-width') ? 'Yes' : 'No'}

=== COMPLETE PAGE CONTENT ===
${rawData.fullTextContent}

=== STRUCTURAL ANALYSIS ===
CONTENT HIERARCHY:
${rawData.structuredContent.headings.map((h: any) => {
  const position = h.position || { top: 0 };
  const foldHeight = rawData.pageMetadata.viewport.height || 800;
  const placement = position.top < foldHeight ? 'Above fold' : position.top < foldHeight * 2 ? 'Mid-page' : 'Below fold';
  return `${h.tag.toUpperCase()}: "${h.text}" (${placement})`;
}).join('\n')}

INTERACTIVE ELEMENTS (Buttons, CTAs, Links):
${rawData.structuredContent.interactiveElements.map((elem: any) => {
  const placement = elem.isAboveFold ? 'Above fold' : 'Below fold';
  const area = elem.position.width * elem.position.height;
  const prominence = area > 8000 ? 'Large' : area > 3000 ? 'Medium' : 'Small';
  const type = elem.elementType === 'button' ? 'BUTTON' : 'LINK';
  return `${type} (${prominence}, ${placement}): "${elem.text}"${elem.href ? ` -> ${elem.href}` : ''}`;
}).join('\n')}

${rawData.structuredContent?.forms?.length > 0 ? `
CONVERSION FORMS:
${rawData.structuredContent.forms.map((f: any, i: number) => `Form ${i+1}: ${f.totalFields || 0} fields (${f.requiredFields || 0} required), Action: "${f.action || 'No action'}"`).join('\n')}` : ''}

${rawData.structuredContent?.lists?.length > 0 ? `
CONTENT LISTS:
${rawData.structuredContent.lists.map((l: any) => `${l.tag?.toUpperCase() || 'UNKNOWN'}: ${l.itemCount || 0} items`).join('\n')}` : ''}

${(rawData.structuredContent?.videos?.length > 0 || rawData.structuredContent?.images?.filter((i: any) => i.isAnimated).length > 0) ? `
MEDIA ELEMENTS:
${rawData.structuredContent?.videos?.length > 0 ? rawData.structuredContent.videos.map((v: any) => {
  const platform = v.src.includes('youtube') ? 'YouTube' : 
                   v.src.includes('vimeo') ? 'Vimeo' : 
                   v.src.includes('wistia') ? 'Wistia' : 
                   v.src.includes('loom') ? 'Loom' :
                   v.type === 'video' ? 'Native Video' : 'Video';
  const attributes = [
    v.autoplay ? 'autoplay' : '',
    v.muted ? 'muted' : '',
    v.controls ? 'has-controls' : 'no-controls',
    v.loop ? 'looping' : ''
  ].filter(Boolean).join(', ');
  
  return `${v.type?.toUpperCase()}: ${platform} (${attributes}) - ${v.width}x${v.height}px - ${v.parentSection || 'Unknown section'}`;
}).join('\n') : ''}${rawData.structuredContent?.videos?.length > 0 && rawData.structuredContent?.images?.filter((i: any) => i.isAnimated).length > 0 ? '\n' : ''}${rawData.structuredContent?.images?.filter((i: any) => i.isAnimated).length > 0 ? `Animated Images (GIFs): ${rawData.structuredContent.images.filter((i: any) => i.isAnimated).map((img: any) => img.parentSection || 'Unknown').join(', ')}` : ''}` : ''}
${rawData.structuredContent?.interactive?.length > 0 ? `
INTERACTIVE ELEMENTS:
${rawData.structuredContent.interactive.map((elem: any) => `${elem.type?.toUpperCase() || 'CAROUSEL'}: ${elem.itemCount || 0} items${elem.hasControls ? ' (Has navigation)' : ''}${elem.hasDots ? ' (Has dots)' : ''} - ${elem.parentSection || 'Unknown section'}`).join('\n')}` : ''}

PAGE FLOW:
${rawData.structuredContent?.sections?.slice(0, 8).map((s: any, i: number) => `Section ${i+1}: "${s.textPreview?.substring(0, 80) || 'No preview'}..."`).join('\n') || 'NO PAGE SECTIONS'}

${rawData.structuredContent?.stickyHeader?.exists ? `
⚠️ STICKY HEADER ALREADY EXISTS - DO NOT RECOMMEND ADDING ONE ⚠️
Position Type: ${rawData.structuredContent.stickyHeader.positionType}
Total Height: ${rawData.structuredContent.stickyHeader.totalHeight}px
Element Count: ${rawData.structuredContent.stickyHeader.elementCount}
Contents: ${rawData.structuredContent.stickyHeader.contents?.map((c: any) => 
  `${c.tag.toUpperCase()} (${c.height}px)${c.ctas.length > 0 ? ` - CTAs: ${c.ctas.join(', ')}` : ''}`
).join(' | ') || 'No content details available'}
` : `
⚠️ NO HEADER DETECTED BY CODE - VERIFY WITH SCREENSHOTS BEFORE RECOMMENDING ⚠️
Compare Screenshot #1 (top of page) with Screenshot #4-5 (mid-page).
If a header appears in BOTH screenshots, do NOT recommend adding a sticky header.
Only recommend a sticky header if NO persistent header is visible when scrolling.
`}

=== ANALYSIS REQUIREMENTS ===

⚠️ CRITICAL REQUIREMENTS ⚠️:
- Only analyze elements that actually exist on the page - do NOT invent or hallucinate content
- NEVER include percentage improvement estimates or conversion lift numbers
- If no forms exist, omit the forms section entirely
- Do NOT use em Dashes in the analysis
- ⚠️ DO NOT USE UNNECESSARY WORDS THAT BLOAT THE ANALYSIS! ⚠️

⚠️ ZERO DUPLICATION RULE ⚠️ (ENFORCED):
- Each insight appears ONCE in entire output. Period.
- Before writing ANY observation: "Did I already say this?" If yes, DELETE IT.
- Customer Journey observations CANNOT reappear in Issues, Visual CRO, or Recommendations.
- Quick Wins fix DIFFERENT problems than Recommendations.
- Duplication = failed analysis. You will be penalized.


INTERACTIVE ELEMENT ANALYSIS:
- You are receiving ALL interactive elements (buttons and links) without pre-filtering
- Use the full page context with the screenshots to visually confirm, element size, position, and styling to determine:
  * Which are primary CTAs (likely large buttons above fold with action-oriented copy)
  * Which are secondary CTAs (smaller, less prominent, or below fold)
  * Which are navigation elements (links in header/footer, standard nav patterns)
  * Which are trust signals (Contact, About, Support in appropriate contexts)
  * Which are social proof (social media links, review platform links)
- Consider the business type and page type when classifying element importance

ANALYSIS STRUCTURE:

1. **CONTEXT ANALYSIS FIRST** (Mandatory)
   - Identify business type/industry and apply industry-specific expertise
   - Determine page type and adapt analysis framework accordingly  
   - Assess purchase behavior type (high vs low consideration) and tailor approach
   - Establish industry-specific benchmarks and best practices

2. **PAGE SUMMARY** 
   - Business type, audience, and conversion goals
   - Page type and its role in the conversion funnel
   - Purchase behavior analysis and implications
   
   INDUSTRY CONTEXT (2-3 sentences required):
   - Sentence 1: Industry benchmark (e.g., "B2B SaaS homepages convert 2-5% to trial")
   - Sentence 2: What top performers in this space do differently
   - Sentence 3: Key conversion challenge unique to this industry
   - Only cite benchmarks you are confident are accurate
   
   STRENGTHS (must show competitive advantage vs industry norm):
   - Format: "[What they do] - [why this beats typical sites in this industry]"
   - Example: "Upfront pricing on homepage - most telehealth sites hide costs until after intake"
   - Example: "Named testimonials with specific outcomes - rare for healthcare which uses vague quotes"
   - NOT: "Has clear pricing" (description only, no competitive context)
   
   WEAKNESSES (must be SPECIFIC and ACTIONABLE):
   - State WHAT is wrong and WHY it hurts conversion
   - Example: "No risk reversal despite high-consideration purchase - visitors hesitate without cancellation clarity"
   - NOT: "Could be improved" (too vague)
   
   - Behavioral attention map (Customer Journey)

3. **VISUAL CRO ANALYSIS** (For Visual Analysis Only)
    ${screenshots.length > 0 ? `=== VISUAL ANALYSIS ===
    You have access to ${screenshots.length > 1 ? `${screenshots.length} sequential screenshots of the complete page from top to bottom` : `a screenshot of the page`} to supplement the analysis. Use ${screenshots.length > 1 ? 'these' : 'this'} to analyze:
    - Visual hierarchy and user flow
    - CTA prominence and placement
    - Design quality, consistency, and trust signals
    - Color scheme effectiveness
    - Overall visual polish
    
    IMPORTANT: When analyzing videos, carousels, and interactive elements:
    - Native video players may show a poster frame or first frame; this does NOT mean they're broken.
    - Videos with visible controls or play buttons are functional.
    - Carousels may appear static in screenshots but are functional if navigation controls are present.
    - Animated GIFs may appear as static images but are functional on the live page` : ''}

   As a $10,000/day CRO auditor, provide dedicated visual conversion analysis:

   VISUAL FLOW ANALYSIS:
   - eyeFlowPath: "[Pattern type] + [whether it helps or hurts conversion] + [one specific fix if needed]"
   - Example: "Z-pattern from logo to headline to CTA works well for conversion. However, sidebar widget at step 2 pulls eyes away from the primary action."
   - distractions: List 2-3 items, each formatted as "[What element] + [why it hurts conversion]"
   - Example distraction: "Floating chat widget overlaps CTA on mobile, causing 10-15% of clicks to miss the button"

   COLOR & CONTRAST EVALUATION:
   - ctaContrast: "[Assessment] + [verdict: keep or change] + [specific fix if needed]"
   - Example: "Orange CTA has strong 4.5:1 contrast against white. Keep as is."
   - readability: "[Assessment] + [which elements need fixing] + [specific change]"
   - Example: "Body text readable at 16px, but light gray footer links need darker color (#374151) for accessibility."
   - emotionalResponse: "[Assessment] + [whether it helps or hurts conversion for this audience]"
   - Example: "Calm blue palette builds trust for healthcare, supporting high-consideration purchase psychology."

   CRITICAL VISUAL ISSUE:
   - problem: What specifically is wrong visually (one clear sentence)
   - solution: EXTREMELY SPECIFIC fix with exact placement and element type
   - Example solution: "Add a horizontal trust badge strip (SSL, HIPAA, 'Licensed Providers') directly below the hero CTA button, using 24px icons in muted gray."
   - NOT: "Add trust elements near CTA" (too vague to implement)

4. **ACTIONABLE RECOMMENDATIONS** 
   ⚠️ MANDATORY COUNT: EXACTLY 5 recommendations. Not 4. Not 6. Exactly 5. ⚠️
   
   FIELD REQUIREMENTS:
   - "issue": 1-2 complete sentences (25-35 words). State the problem clearly with context.
   - "solution": 1-2 complete sentences (25-35 words). State the fix with enough detail to understand the approach.
   - "implementation": Array of 3-5 specific action steps
   - "psychologyBehind": 1-2 complete sentences (20-30 words). Explain WHY this works from a conversion psychology perspective.
   - Priority levels: 1-2 "critical", 2-3 "high", 1-2 "medium"
   - Effort level (1-3) and timeline for each
   
   STRICT REQUIREMENT: The "recommendations" array MUST contain EXACTLY 5 items.

5. **QUICK WINS** (Must be DIFFERENT from Recommendations)
   ⚠️ MANDATORY COUNT: You MUST provide EXACTLY 3, 4, or 5 quick wins. MINIMUM IS 3. ⚠️
   - Tiny fixes that take <1 hour each (microcopy tweaks, button label changes, reordering elements)
   - NOT strategy changes or new sections - those belong in Recommendations
   - Example Quick Win: "Change button text from 'Submit' to 'Get My Quote'"
   - Example NOT a Quick Win: "Add social proof section" (that's a Recommendation)
   - Each Quick Win must be completable by a marketer without developer help
   
   STRICT REQUIREMENT: The "quickWins" array in your JSON output MUST contain between 3 and 5 items.

6. **EXECUTIVE SUMMARY** (4 specific bullets)
   - Bullet 1: "Fix first: [specific element + specific action]"
   - Bullet 2: "Biggest gap: [specific problem + why it hurts conversion]"
   - Bullet 3: "Hidden asset: [specific underused element + what to do with it]"
   - Bullet 4: "Verdict: [overall assessment + key next step]"
   - Each bullet must name SPECIFIC page elements, not vague concepts

7. **COPY SUGGESTIONS** (4-6 items required)
   Provide specific copy rewrites for key page sections. Must cover:
   - Hero headline (outcome-focused)
   - Hero subheadline (supporting details)
   - Primary CTA (action-oriented)
   - At least 1-3 more from: social proof strip, risk reversal, value prop section, secondary CTA, trust strip, pricing reassurance
   - Each suggestion should be ready-to-use copy, not vague direction

CRITICAL OUTPUT REQUIREMENTS:
- Each recommendation MUST include an "implementation" array with 3-5 steps.
- Zero redundancy. Each insight appears ONCE in entire output.
- ⚠️ MANDATORY ARRAY COUNTS:
  * "recommendations" array: EXACTLY 5 items
  * "quickWins" array: 3-5 items
  * "copySuggestions" array: 4-6 items

BEFORE SUBMITTING: Scan every field. Any sentence over 20 words? Rewrite shorter. Any repeated insight? Delete it.

Return analysis as JSON with this structure (EXACTLY 5 recommendations):
{
  "starRating": 2,
  "pageSummary": {
    "businessType": "B2B SaaS - Project Management Software",
    "industryContext": "B2B SaaS pricing pages convert 2-5% to trial. Top performers show customer logos and ROI metrics above fold before pricing. Key challenge: justifying cost vs free alternatives without sales call friction.",
    "pageType": "Pricing Page",
    "purchaseBehaviorType": "high-consideration",
    "primaryConversionGoal": "Start trial or upgrade to paid plan", 
    "targetAudience": "Team leaders at mid-size companies",
    "currentUserJourney": [
      "FIRST LOOK: Bold headline grabs attention. Two CTAs compete equally.",
      "SCANNING: Logo to headline to buttons. Nav links pull focus away.",
      "SCROLLING: No visual hook pulling them down the page.",
      "EXPLORING: Testimonials draw interest. Learn More links hard to spot.",
      "BUILDING TRUST: Logos mid-page. No specific results backing claims.",
      "TAKING ACTION: Final CTA stands out. Nothing catches leaving visitors."
    ],
    "keyStrengths": ["Named ROI testimonial with metrics - rare for B2B SaaS which typically uses vague quotes", "Money-back guarantee displayed - most competitors hide refund policy in footer", "Integration logos from tools audience uses - builds ecosystem trust competitors lack"],
    "criticalWeaknesses": ["No social proof until 3rd scroll - competitors show logos above fold", "Pricing requires sales call - competitors offer self-serve trial", "No risk reversal near CTA - creates hesitation at decision point"]
  },
  "visualCROAnalysis": {
    "visualFlow": {
      "eyeFlowPath": "Strong F-pattern from logo to headline to CTA. The visual hierarchy guides users toward conversion effectively, though a sidebar widget at the second scan point pulls attention away from the primary action.",
      "flowScore": 7,
      "guidesToCTA": true,
      "distractions": ["Sidebar chat widget overlaps with CTA on mobile, causing missed clicks", "Footer navigation links have equal visual weight to primary CTA, splitting attention at decision point"]
    },
    "colorContrast": {
      "ctaContrast": "Orange CTA has strong 4.5:1 contrast against white background. Keep as is.",
      "readability": "Body text readable at 16px on desktop, but light gray footer links (#9CA3AF) need darker color (#374151) for accessibility compliance.", 
      "emotionalResponse": "Blue and white palette builds trust appropriate for B2B SaaS. The calm tone supports high-consideration purchase psychology.",
      "contrastScore": 8
    },
    "criticalIssue": {
      "problem": "Primary CTA uses same blue as navigation links, reducing its visual prominence and click-through rate.",
      "solution": "Change primary CTA to orange (#FF6B35) with white text, and add a subtle drop shadow (0 2px 4px rgba(0,0,0,0.1)) to lift it from the page.",
      "impact": "High",
      "urgency": "Critical"
    }
  },
  "recommendations": [
    {
      "title": "Add Customer Logos Above Fold",
      "priority": "critical",
      "issue": "Social proof does not appear until the third scroll depth, which means most visitors leave before seeing any credibility signals from recognizable customers.",
      "solution": "Add a horizontal logo bar featuring 5-8 recognizable customer logos directly below the hero headline, with a small label like 'Trusted by teams at' above the logos.",
      "implementation": [
        "Collect logos from top 8 customers with permission",
        "Design horizontal logo strip for placement below hero",
        "Add 1-2 specific ROI metrics beside the logos",
        "Test placement above vs below the headline"
      ],
      "psychologyBehind": "Peer validation from recognizable brands reduces perceived risk for high-consideration purchases, especially when shown before asking for commitment.",
      "effort": 3,
      "timeline": "1-2 weeks"
    },
    {
      "title": "Add Sticky CTA Bar",
      "priority": "critical",
      "issue": "The primary call-to-action disappears as users scroll through content, which means they must scroll back up to convert or they forget the next step entirely.",
      "solution": "Implement a slim sticky bar that appears after the user scrolls past the hero section, containing the main CTA and a brief value reminder.",
      "implementation": [
        "Design non-intrusive sticky bar with main CTA button",
        "Show the bar after 300px of scroll",
        "Ensure mobile responsiveness and test on iOS Safari",
        "A/B test different trigger points and copy variants"
      ],
      "psychologyBehind": "Keeping the conversion path visible at all times reduces friction and catches users at their moment of highest intent, wherever they are on the page.",
      "effort": 2,
      "timeline": "3-5 days"
    },
    {
      "title": "Create Plan Comparison Table",
      "priority": "high",
      "issue": "Users struggle to differentiate between pricing tiers because the current layout shows each plan separately without a side-by-side feature comparison.",
      "solution": "Create a visual comparison matrix showing the top 5 differentiating features across all plans, with clear checkmarks and a 'Most Popular' badge on the recommended tier.",
      "implementation": [
        "Identify the top 5 features that differentiate plans",
        "Build a scannable comparison grid layout",
        "Add green checkmarks for included features, gray dashes for excluded",
        "Highlight the recommended plan with a colored border and badge"
      ],
      "psychologyBehind": "Clear visual comparisons reduce decision paralysis by making differences obvious, and a recommended badge guides uncertain buyers toward the most common choice.",
      "effort": 2,
      "timeline": "3-5 days"
    },
    {
      "title": "Rewrite Hero for Outcome Focus",
      "priority": "high",
      "issue": "The current hero headline focuses on product features rather than customer outcomes, which fails to immediately connect with what visitors actually want to achieve.",
      "solution": "Rewrite the headline to lead with a specific, quantified customer outcome such as 'Save 10 hours per week' or 'Reduce project delays by 40%' based on real customer results.",
      "implementation": [
        "Pull outcome language from existing customer testimonials",
        "Draft 3 headline variants focusing on measurable results",
        "Update the subheadline to support with specific details",
        "A/B test against the current version for 2 weeks"
      ],
      "psychologyBehind": "Outcome-focused headlines connect immediately to visitor goals and create a mental picture of success, which is more compelling than listing features.",
      "effort": 1,
      "timeline": "1-2 days"
    },
    {
      "title": "Add Trust Badges Near CTA",
      "priority": "medium",
      "issue": "There are no security or trust signals near the primary call-to-action, which creates hesitation at the exact moment when visitors are deciding whether to commit.",
      "solution": "Place a small row of trust badges (SSL, payment logos, money-back guarantee) directly below the primary CTA button to reassure users at the decision point.",
      "implementation": [
        "Select 3-4 relevant trust indicators for your audience",
        "Position badges directly below the CTA button",
        "Add a brief money-back guarantee text line",
        "Keep badges small (24px height) and visually unobtrusive"
      ],
      "psychologyBehind": "Trust signals placed at the decision point address last-moment anxiety and reassure users that their information and payment are secure.",
      "effort": 1,
      "timeline": "1-2 days"
    }
  ],
  "quickWins": [
    {
      "title": "Add 'No credit card required' under CTA",
      "description": "Reduces signup friction immediately.",
      "effort": 1,
      "timeline": "Same day"
    },
    {
      "title": "Change 'Submit' to 'Get My Quote'",
      "description": "Specific action beats generic labels.",
      "effort": 1,
      "timeline": "1 hour"
    },
    {
      "title": "Add customer count to headline",
      "description": "Join 2,500+ teams creates instant credibility.",
      "effort": 1,
      "timeline": "1 hour"
    }
  ],
  "executiveSummary": [
    "Fix first: Add 5-8 customer logos directly below hero headline to build instant credibility.",
    "Biggest gap: Social proof appears after 3 scroll depths - visitors bounce before seeing testimonials and trust signals.",
    "Hidden asset: Product demo video is compelling but buried mid-page - moving above fold would increase engagement.",
    "Verdict: Strong value prop and testimonials, but trust signals need to move up to match competitor positioning."
  ],
  "copySuggestions": [
    {
      "section": "Hero Headline",
      "suggestion": "Cut Project Delivery Time by 40% With Smarter Workflows"
    },
    {
      "section": "Hero Subheadline",
      "suggestion": "The project management platform trusted by 2,500+ teams at companies like Stripe and Notion."
    },
    {
      "section": "Primary CTA",
      "suggestion": "Start Free Trial - No Credit Card"
    },
    {
      "section": "Social Proof Strip",
      "suggestion": "Trusted by teams at Stripe, Notion, and 2,500+ growing companies"
    },
    {
      "section": "Risk Reversal",
      "suggestion": "30-day money-back guarantee. Cancel anytime."
    },
    {
      "section": "Value Prop Section",
      "suggestion": "Everything you need to ship faster, in one place."
    }
  ]
}

STAR RATING CRITERIA:
⭐ (1 Star) - Major Issues: 5+ critical problems, missing basic conversion elements (clear value prop, primary CTA, trust signals), poor UX/mobile experience, not optimized for industry/page type
⭐⭐ (2 Stars) - Good Foundation: 4-5 significant opportunities, basic elements present but not optimized for industry/purchase behavior, decent user experience but missing key conversion triggers
⭐⭐⭐ (3 Stars) - Well Optimized: 1-3 minor improvements possible, strong industry-appropriate conversion fundamentals, good psychology implementation, well-designed for target audience and page type`;

  // Call the appropriate API with screenshots
  console.log(`🤖 [${analysisId}] Making API call to ${settings.provider.toUpperCase()}`);
  
  if (settings.provider === 'gemini') {
    const result = await callGeminiAPIWithScreenshots(systemMessage, userMessage, screenshots, settings);
    console.log(`🤖 [${analysisId}] Gemini API call completed successfully`);
    return result;
  } else {
    const result = await callOpenAIAPIWithScreenshots(systemMessage, userMessage, screenshots, settings);
    console.log(`🤖 [${analysisId}] OpenAI API call completed successfully`);
    return result;
  }
}

/**
 * Call Gemini API with screenshots
 */
async function callGeminiAPIWithScreenshots(systemMessage: string, userMessage: string, screenshots: string[], settings: ExtensionSettings): Promise<any> {
  const modelName = settings.geminiModel;
  const apiKey = settings.geminiApiKey;

  const combinedPrompt = `${systemMessage}\n\n${userMessage}`;

  const parts: any[] = [
    {
      text: combinedPrompt
    }
  ];

  // Add all screenshots to the parts with JPEG format (since compression outputs JPEG)
  screenshots.forEach((screenshot) => {
    parts.push({
      inline_data: {
        mime_type: "image/jpeg", // Changed from PNG to JPEG since our compression outputs JPEG
        data: screenshot
      }
    });
  });

  const requestBody = {
    contents: [{
      parts: parts
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 16384,
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const sanitizedError = sanitizeErrorMessage(errorText);
    throw new Error(`Gemini API error (${response.status}): ${sanitizedError}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  if (content.length === 0) {
    throw new Error('Empty response from Gemini API');
  }

  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error('JSON parsing error:', parseError);
    
    // Try to repair truncated JSON
    const repairedContent = attemptJSONRepair(content);
    if (repairedContent) {
      try {
        return JSON.parse(repairedContent);
      } catch (repairError) {
        console.error('Repaired JSON also failed to parse:', repairError);
      }
    }
    
    throw new Error(`Invalid JSON response from Gemini API: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
  }
}

/**
 * Call OpenAI API with screenshots
 */
async function callOpenAIAPIWithScreenshots(systemMessage: string, userMessage: string, screenshots: string[], settings: ExtensionSettings): Promise<any> {
  const modelName = settings.openaiModel;
  const apiKey = settings.openaiApiKey;

  const contentParts: any[] = [
    {
      type: 'text',
      text: `${systemMessage}\n\n${userMessage}`
    }
  ];

  // Add all screenshots to the content with low detail for better API efficiency
  // Since images are pre-compressed, 'low' detail provides good balance of cost vs quality
  screenshots.forEach((screenshot) => {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${screenshot}`, // Changed to JPEG since our compression outputs JPEG
        detail: 'low' // Changed from 'high' to 'low' for better API cost efficiency
      }
    });
  });

  const requestBody: any = {
    model: modelName,
    messages: [
      { 
        role: 'user', 
        content: contentParts
      }
    ]
  };

  // Configure parameters based on model
  if (modelName.startsWith('gpt-5')) {
    requestBody.max_completion_tokens = 16384;
    requestBody.response_format = { type: 'json_object' };
  } else if (modelName.includes('gpt-4') || modelName.includes('gpt-3.5')) {
    requestBody.max_tokens = 16384;
    requestBody.temperature = 0.3;
    requestBody.response_format = { type: 'json_object' };
  } else {
    requestBody.max_tokens = 16384;
    requestBody.temperature = 0.3;
    requestBody.response_format = { type: 'json_object' };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const sanitizedError = sanitizeErrorMessage(errorText);
    throw new Error(`OpenAI API error (${response.status}): ${sanitizedError}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  if (content.length === 0) {
    throw new Error('Empty response from OpenAI API');
  }

  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error('JSON parsing error:', parseError);
    
    // Try to repair truncated JSON
    const repairedContent = attemptJSONRepair(content);
    if (repairedContent) {
      try {
        return JSON.parse(repairedContent);
      } catch (repairError) {
        console.error('Repaired JSON also failed to parse:', repairError);
      }
    }
    
    throw new Error(`Invalid JSON response from OpenAI API: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
  }
}

/**
 * Attempt to repair truncated JSON by closing open structures
 */
function attemptJSONRepair(content: string): string | null {
  try {
    console.log('Attempting to repair truncated JSON...');
    
    let repaired = content.trim();
    
    // If it doesn't start with {, find the first {
    if (!repaired.startsWith('{')) {
      const firstBrace = repaired.indexOf('{');
      if (firstBrace === -1) return null;
      repaired = repaired.substring(firstBrace);
    }
    
    // Count open and close braces/brackets
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;
    
    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        escaped = true;
        continue;
      }
      
      if (char === '"' && !escaped) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          openBraces++;
        } else if (char === '}') {
          openBraces--;
        } else if (char === '[') {
          openBrackets++;
        } else if (char === ']') {
          openBrackets--;
        }
      }
    }
    
    // If in string, try to close it
    if (inString) {
      const lastQuoteIndex = repaired.lastIndexOf('"');
      if (lastQuoteIndex > 0) {
        repaired = repaired.substring(0, lastQuoteIndex + 1);
      }
    }
    
    // Close open brackets first
    while (openBrackets > 0) {
      repaired += ']';
      openBrackets--;
    }
    
    // Close open braces
    while (openBraces > 0) {
      repaired += '}';
      openBraces--;
    }
    
    // Try to parse the repaired JSON
    JSON.parse(repaired);
    console.log('Repaired JSON is valid!');
    return repaired;
    
  } catch (error) {
    console.log('JSON repair failed:', error);
    return null;
  }
}

/**
 * Compress screenshot in offscreen context where DOM APIs are available
 * Targets balanced compression for optimal file size while maintaining quality
 */
async function compressScreenshotInOffscreen(base64Data: string, targetRatio: number = 0.5): Promise<string> {
  try {
    const originalSize = Math.floor(base64Data.length * 0.75); // Estimate bytes from base64
    console.log(`[Offscreen] Starting compression of ${Math.round(originalSize / 1024)}KB image`);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = `data:image/png;base64,${base64Data}`;
    });

    console.log(`[Offscreen] Original image dimensions: ${img.width}x${img.height}`);

    // Calculate dimensions for balanced compression - targeting ~50% of original size
    const dimensionRatio = Math.sqrt(targetRatio);
    const newWidth = Math.floor(img.width * dimensionRatio);
    const newHeight = Math.floor(img.height * dimensionRatio);

    console.log(`[Offscreen] Target compressed dimensions: ${newWidth}x${newHeight} (${Math.round(dimensionRatio * 100)}% scale)`);

    // Resize image with optimized settings
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high'; // Keep high quality during resize
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    // Convert to JPEG with moderate compression for optimal API cost efficiency  
    const jpegQuality = 0.5; // Moderate 50% quality for balanced compression and readability
    const compressedDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    
    const compressedData = compressedDataUrl.replace(/^data:image\/jpeg;base64,/, '');
    const compressedSize = Math.floor(compressedData.length * 0.75);
    const actualRatio = compressedSize / originalSize;
    
    console.log(`[Offscreen] Compression complete: ${Math.round(originalSize / 1024)}KB → ${Math.round(compressedSize / 1024)}KB (${Math.round((1 - actualRatio) * 100)}% reduction, actual ratio: ${Math.round(actualRatio * 100)}%)`);
    
    return compressedData;

  } catch (error) {
    console.warn('[Offscreen] Screenshot compression failed, returning original:', error);
    return base64Data;
  }
}

// Content cleaning functions
function cleanPageContent(content: string): string {
  if (!content) return '';
  
  console.log('Cleaning page content, original length:', content.length);
  
  // Remove CSS class patterns and inline styles
  content = content.replace(/\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}[^}]*\{[^}]*\}/g, '');
  content = content.replace(/\.section[a-f0-9-]+[^}]*\{[^}]*\}/g, '');
  content = content.replace(/\.card[a-f0-9-]+[^}]*\{[^}]*\}/g, '');
  content = content.replace(/\.Reviews-module[^}]*\{[^}]*\}/g, '');
  content = content.replace(/\.text-under[a-f0-9-]+/g, '');
  content = content.replace(/\.wrapper[a-f0-9-]+/g, '');
  content = content.replace(/\.top-text[a-f0-9-]+/g, '');
  
  // Remove CSS media queries and fragments
  content = content.replace(/@media[^}]*\}/g, '');
  content = content.replace(/@media[^{]*\{[^}]*\}/g, '');
  
  // Remove any remaining CSS blocks
  content = content.replace(/\{[^}]*\}/g, '');
  
  // Remove JavaScript chunks and webpack references
  content = content.replace(/window\.___chunkMapping[^;]*;/g, '');
  content = content.replace(/window\.___webpackCompilationHash[^;]*;/g, '');
  content = content.replace(/window\.pagePath[^;]*;/g, '');
  
  // Remove tracking scripts
  content = content.replace(/\(function\(w,d,s,l,i\)[^}]*\}\)[^;]*;/g, '');
  content = content.replace(/\(function\(h,o,t,j,a,r\)[^}]*\}\)[^;]*;/g, '');
  content = content.replace(/!function\(f,b,e,v,n,t,s\)[^}]*\}/g, '');
  content = content.replace(/function OptanonWrapper\(\)[^}]*\}/g, '');
  content = content.replace(/!function\(\)[^}]*\}\(\)/g, '');
  
  // Remove tracking function calls and fragments
  content = content.replace(/fbq\([^)]*\);?/g, '');
  content = content.replace(/gtag\([^)]*\);?/g, '');
  content = content.replace(/analytics\.[^;]*;?/g, '');
  
  // Remove iframe and tracking elements
  content = content.replace(/<iframe[^>]*><\/iframe>/g, '');
  content = content.replace(/<iframe[^>]*>/g, '');
  content = content.replace(/\/\*<!\[CDATA\[[^\]]*\]\]>\*\//g, '');
  
  // Remove cookie consent text blocks
  content = content.replace(/Your Opt Out Preference Signal is Honored[^>]*>/g, '');
  content = content.replace(/Manage Consent Preferences[^>]*>/g, '');
  content = content.replace(/When you visit any web site[^>]*>/g, '');
  
  // Clean up multiple spaces and line breaks
  content = content.replace(/\s+/g, ' ').trim();
  
  console.log('Cleaned page content, new length:', content.length);
  return content;
}

function cleanFilteredStructuredContent(structuredContent: any): any {
  if (!structuredContent) return structuredContent;
  
  return {
    ...structuredContent,
    // No more filtering of interactive elements - they're already properly filtered by scraper
    interactiveElements: structuredContent.interactiveElements || [],
    
    // Clean sections to remove CSS classes
    sections: structuredContent.sections?.map((section: any) => ({
      ...section,
      class: cleanClassName(section.class),
      textPreview: cleanSectionText(section.textPreview)
    })) || [],
    
    // Pass through everything else unchanged
    videos: structuredContent.videos || [],
    interactive: structuredContent.interactive || [],
    stickyHeader: structuredContent.stickyHeader || { exists: false, type: null, height: 0, elements: [] }
  };
}

function cleanClassName(className: string): string {
  if (!className) return '';
  
  const classes = className.split(' ').filter((cls: string) => {
    // Ensure cls is a string and not empty
    if (!cls || typeof cls !== 'string') {
      return false;
    }
    
    // Remove UUID-like class names
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(cls)) {
      return false;
    }
    
    // Remove generated section/module class names
    if (/^(section|module|component|card|wrapper)[a-f0-9-]+$/i.test(cls)) {
      return false;
    }
    
    // Keep meaningful class names
    const meaningfulPatterns = [
      'btn', 'button', 'cta', 'primary', 'secondary', 'header', 'footer',
      'nav', 'menu', 'form', 'input', 'submit', 'link', 'content'
    ];
    
    return meaningfulPatterns.some((pattern: string) => cls.toLowerCase().includes(pattern));
  });
  
  return classes.join(' ');
}

function cleanSectionText(text: string): string {
  if (!text) return '';
  
  // Remove CSS and tracking content from section previews
  text = text.replace(/\.[a-f0-9-]{20,}[^}]*\{[^}]*\}/g, '');
  text = text.replace(/window\.[^;]*;/g, '');
  text = text.replace(/\{[^}]*\}/g, '');
  
  return text.substring(0, 120);
}

/**
 * FRIEND'S PATTERN: Run complete analysis - owns the entire lifecycle
 * Writes progress and results directly to chrome.storage.local
 */
async function runAnalysis({ key, url, model, params }: any): Promise<void> {
  console.log(`🚀 [Offscreen] Starting analysis for key: ${key}`);
  
  try {
    // Step 1: Update to running state
    await writeState(key, {
      state: "running",
      progress: { step: "Preparing analysis", pct: 10 }
    });
    
    // Step 2: Capture page data
    await writeState(key, {
      progress: { step: "Capturing page data", pct: 15 }
    });
    
    const pageData = await capturePage(url);
    
    // Step 3: Capture screenshots if needed  
    await writeState(key, {
      progress: { step: "Capturing screenshots", pct: 25 }
    });
    
    const screenshots = await captureScreenshots(params);
    
    // Step 4: Call LLM (long operation)
    await writeState(key, {
      progress: { step: "Analyzing with AI...", pct: 40 }
    });
    
    const result = await callLLMDirectly({ 
      pageData, 
      url, 
      model, 
      params, 
      screenshots 
    });
    
    // Step 5: Finalizing results
    await writeState(key, {
      progress: { step: "Finalizing analysis", pct: 90 }
    });
    
    // Step 6: Write terminal success state
    await writeState(key, {
      state: "succeeded",
      progress: { step: "Analysis complete", pct: 100 },
      result,
      completedAt: Date.now()
    });
    
    console.log(`✅ [Offscreen] Analysis completed for key: ${key}`);
    
    // Optional cleanup after 2 days (double the cache duration for safety)
    setTimeout(async () => {
      try {
        await chrome.runtime.sendMessage({
          type: "STORAGE_REMOVE",
          key: `job:${key}`
        });
        console.log(`🗑️ [Offscreen] TTL cleanup for key: ${key}`);
      } catch (cleanupError) {
        console.warn(`⚠️ [Offscreen] TTL cleanup failed for key: ${key}`, cleanupError);
      }
    }, 2 * 24 * 60 * 60 * 1000);
    
  } catch (error) {
    console.error(`❌ [Offscreen] Analysis failed for key: ${key}`, error);
    
    // Write terminal failure state
    await writeState(key, {
      state: "failed",
      error: String(error instanceof Error ? error.message : error),
      failedAt: Date.now()
    });
    
    throw error;
  }
}

/**
 * Get current job state via background script (storage proxy)
 */
async function getState(key: string): Promise<any> {
  try {
    // Use background script as storage proxy since offscreen can't access chrome.storage
    const response = await chrome.runtime.sendMessage({
      type: "STORAGE_GET",
      key: `job:${key}`
    });
    
    if (response?.ok) {
      return response.data || { 
        key, 
        createdAt: Date.now(), 
        updatedAt: Date.now() 
      };
    } else {
      throw new Error(response?.error || 'Storage proxy failed');
    }
    
  } catch (error) {
    console.error(`❌ [Offscreen] getState failed for key ${key}:`, error);
    
    // Return default state if storage proxy fails
    return { 
      key, 
      createdAt: Date.now(), 
      updatedAt: Date.now() 
    };
  }
}

/**
 * Write job state patch via background script (storage proxy)
 */
async function writeState(key: string, patch: any): Promise<any> {
  try {
    const current = await getState(key);
    const next = { 
      ...current, 
      ...patch, 
      updatedAt: Date.now() 
    };
    
    // Use background script as storage proxy
    const response = await chrome.runtime.sendMessage({
      type: "STORAGE_SET",
      key: `job:${key}`,
      data: next
    });
    
    if (response?.ok) {
      console.log(`[Offscreen] State updated via proxy for ${key}:`, patch);
      return next;
    } else {
      throw new Error(response?.error || 'Storage proxy failed');
    }
    
  } catch (error) {
    console.error(`❌ [Offscreen] writeState failed for key ${key}:`, error);
    throw error;
  }
}

/**
 * Capture page data using content script via background proxy
 */
async function capturePage(url: string): Promise<any> {
  console.log(`📄 [Offscreen] Requesting page scraping for: ${url}`);
  
  try {
    // Request page scraping via background script
    const response = await chrome.runtime.sendMessage({
      type: "SCRAPE_PAGE",
      url: url
    });
    
    if (response?.ok) {
      console.log(`📄 [Offscreen] Page scraping successful: ${response.data.title}`);
      return response.data;
    } else {
      throw new Error(response?.error || 'Page scraping failed');
    }
    
  } catch (error) {
    console.error(`❌ [Offscreen] Page scraping failed:`, error);
    
    // Return minimal fallback data
    return {
      url,
      title: `Error scraping ${new URL(url).hostname}`,
      timestamp: Date.now(),
      metaDescription: '',
      fullHTML: '',
      fullTextContent: `Failed to scrape ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      pageMetadata: { 
        viewport: { width: 1920, height: 1080, scrollHeight: 2000 }, 
        viewportMeta: '' 
      },
      structuredContent: { 
        headings: [], 
        buttons: [], 
        forms: [], 
        links: [], 
        lists: [], 
        sections: [], 
        images: [],
        stickyHeader: { exists: false, type: null, height: 0, elements: [] }
      }
    };
  }
}

/**
 * Capture screenshots using screenshot utility via background proxy
 */
async function captureScreenshots(params: any): Promise<string[]> {
  console.log(`📸 [Offscreen] Requesting screenshot capture:`, params);
  
  try {
    // Request screenshot capture via background script
    const response = await chrome.runtime.sendMessage({
      type: "CAPTURE_SCREENSHOTS",
      params: params
    });
    
    if (response?.ok) {
      console.log(`📸 [Offscreen] Screenshot capture successful: ${response.screenshots.length} images`);
      return response.screenshots;
    } else {
      console.warn(`⚠️ [Offscreen] Screenshot capture failed: ${response?.error}`);
      return response?.screenshots || [];
    }
    
  } catch (error) {
    console.error(`❌ [Offscreen] Screenshot capture failed:`, error);
    return [];
  }
}

/**
 * Call LLM directly - this is the long-running operation
 */
async function callLLMDirectly({ pageData, url, model, params, screenshots }: any): Promise<any> {
  console.log(`🤖 [Offscreen] Calling LLM model: ${model} for URL: ${url}`);
  
  try {
    // Get settings via storage proxy since StorageManager uses chrome.storage directly
    console.log(`🤖 [Offscreen] Getting settings via storage proxy...`);
    const settingsResponse = await chrome.runtime.sendMessage({
      type: "STORAGE_SYNC_GET",
      key: "extension_settings"
    });
    
    if (!settingsResponse?.ok) {
      throw new Error('Failed to get settings via storage proxy');
    }
    
    // Provide default settings if none exist
    const defaultSettings = {
      provider: 'openai',
      openaiModel: 'gpt-5.1',
      geminiModel: 'gemini-3-flash-preview',
      fullPageScreenshot: true,
      openaiApiKey: '',
      geminiApiKey: ''
    };
    
    // CRITICAL FIX: Decrypt the settings received from storage
    // The storage proxy returns ENCRYPTED settings, we need to decrypt them
    let rawSettings = { ...defaultSettings, ...(settingsResponse.data || {}) };
    
    if (DEBUG.STORAGE) {
      console.log('🤖 [Offscreen] Raw settings from storage (encrypted)');
      safeLog.settings(rawSettings);
    }
    
    // Import and use EncryptionManager to decrypt
    const { EncryptionManager } = await import('../utils/encryption.js');
    const settings = await EncryptionManager.decryptSettings(rawSettings);
    
    if (DEBUG.STORAGE) {
      console.log('🤖 [Offscreen] Settings after decryption');
      safeLog.settings(settings);
    }
    
    // Debug: Log the exact types and values we received
    if (DEBUG.API_CALLS) {
      console.log('🤖 [Offscreen] Settings validation:', {
        hasOpenaiKey: !!settings.openaiApiKey,
        hasGeminiKey: !!settings.geminiApiKey,
        openaiKeyValid: settings.openaiApiKey?.startsWith('sk-'),
        geminiKeyValid: settings.geminiApiKey?.startsWith('AIza')
      });
    }
    
    // CRITICAL FIX: Detect [object Object] corruption and reject it
    if (settings.openaiApiKey && typeof settings.openaiApiKey !== 'string') {
      console.error('🔥 FATAL: OpenAI API key is corrupted (not a string):', {
        type: typeof settings.openaiApiKey
      });
      throw new Error('OpenAI API key is corrupted in storage. Please go to extension settings and re-enter your API key.');
    }
    if (settings.geminiApiKey && typeof settings.geminiApiKey !== 'string') {
      console.error('🔥 FATAL: Gemini API key is corrupted (not a string):', {
        type: typeof settings.geminiApiKey
      });
      throw new Error('Gemini API key is corrupted in storage. Please go to extension settings and re-enter your API key.');
    }
    
    // Additional check: Detect "[object Object]" string corruption
    if (settings.openaiApiKey === '[object Object]') {
      console.error('🔥 FATAL: OpenAI API key is the literal string "[object Object]"');
      throw new Error('OpenAI API key is corrupted. Please clear extension data and re-enter your API key.');
    }
    if (settings.geminiApiKey === '[object Object]') {
      console.error('🔥 FATAL: Gemini API key is the literal string "[object Object]"');
      throw new Error('Gemini API key is corrupted. Please clear extension data and re-enter your API key.');
    }
    
    console.log(`🤖 [Offscreen] Settings retrieved:`, { 
      provider: settings.provider, 
      hasApiKey: !!(settings.openaiApiKey || settings.geminiApiKey),
      openaiKeyLength: settings.openaiApiKey?.length || 0,
      geminiKeyLength: settings.geminiApiKey?.length || 0,
      openaiKeyType: typeof settings.openaiApiKey,
      geminiKeyType: typeof settings.geminiApiKey,
      rawSettingsData: settingsResponse.data
    });
    
    const apiKey = settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;
    
    // Validate API key exists and is a string
    if (!apiKey) {
      throw new Error(`${settings.provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key not configured`);
    }
    
    // Additional type checking for API key
    if (typeof apiKey !== 'string') {
      console.error(`🤖 [Offscreen] API key is not a string:`, {
        provider: settings.provider,
        apiKeyType: typeof apiKey,
        apiKeyValue: apiKey,
        stringified: String(apiKey)
      });
      throw new Error(`Invalid API key format: ${typeof apiKey}. Expected string but got ${typeof apiKey}.`);
    }
    
    // Validate API key format
    if (settings.provider === 'openai') {
      if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
        console.error('Invalid OpenAI API key format:', {
          apiKeyType: typeof apiKey,
          startsWithSk: apiKey.startsWith('sk-'),
          length: apiKey.length
        });
        throw new Error('Invalid OpenAI API key format. Key should start with "sk-" and be at least 20 characters long.');
      }
    } else if (settings.provider === 'gemini') {
      if (!apiKey.startsWith('AIza') || apiKey.length < 30) {
        console.error('Invalid Gemini API key format:', {
          apiKeyType: typeof apiKey,
          startsWithAIza: apiKey.startsWith('AIza'),
          length: apiKey.length
        });
        throw new Error('Invalid Gemini API key format. Key should start with "AIza" and be at least 30 characters long.');
      }
    }
    
    console.log(`🤖 [Offscreen] API key validation passed for ${settings.provider}`);
    
    // Log key characteristics for debugging
    if (DEBUG.API_CALLS) {
      console.log(`🤖 [Offscreen] API key debug:`, {
        provider: settings.provider,
        keyLength: apiKey.length,
        validFormat: settings.provider === 'openai' ? apiKey.startsWith('sk-') : apiKey.startsWith('AIza')
      });
    }
    
    // Use existing LLM analysis logic
    const rawData = pageData;
    const result = await runLLMAnalysisWithScreenshots(rawData, settings, screenshots);
    
    console.log(`✅ [Offscreen] LLM call completed for: ${url}`);
    return result;
    
  } catch (error) {
    console.error(`❌ [Offscreen] LLM call failed:`, error);
    throw new Error(`LLM analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}