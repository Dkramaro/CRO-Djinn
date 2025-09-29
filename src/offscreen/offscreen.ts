import { ExtensionSettings, RawPageData } from '../types';

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
  const systemMessage = `You are a $10,000/day Senior Conversion Rate Optimization Consultant with 20+ years of experience across ALL industries. You've optimized pages for Fortune 500 companies and generated millions in additional revenue through conversion optimization.

YOUR EXPERTISE AREAS:
- Consumer Psychology & Behavioral Economics across different industries and purchase types
- A/B Testing & Statistical Analysis for various business models
- UX/UI Conversion Design tailored to specific page types and user journeys
- Industry-Specific Copywriting & Messaging Strategy
- Trust & Credibility Optimization per business type
- Performance Optimization for different conversion goals

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
   - HIGH-CONSIDERATION PURCHASE: Complex, expensive, or high-risk decisions requiring extensive research, social proof, detailed information, and trust building (B2B software, expensive products, professional services, medical/legal services)
   - IMPULSE/LOW-CONSIDERATION PURCHASE: Quick, low-risk decisions that benefit from urgency, scarcity, and streamlined checkout (consumer products, low-cost items, entertainment, basic services)

INDUSTRY-SPECIFIC ANALYSIS REQUIREMENTS:
- Apply industry-specific conversion psychology and benchmarks
- Reference industry-standard conversion rates and best practices
- Use terminology and value propositions relevant to that industry
- Consider industry-specific trust signals and objections
- Apply appropriate urgency and scarcity tactics for that market

PAGE TYPE-SPECIFIC ANALYSIS:
- Tailor recommendations to the page's primary conversion goal
- Consider the user's mindset and intent when landing on this page type
- Apply appropriate conversion frameworks for the page type
- Adjust recommendation priorities based on page function

PURCHASE BEHAVIOR ADAPTATION:
- For HIGH-CONSIDERATION: Focus on trust building, detailed information, social proof, risk reduction, consultative approach, longer-form content, multiple touchpoints
- For IMPULSE/LOW-CONSIDERATION: Focus on simplicity, speed, urgency, clear CTAs, streamlined process, immediate gratification

CUSTOMER JOURNEY MAPPING REQUIREMENTS:
- Start with the visitor's entry point (search intent, traffic source, mindset)
- Map each section of the page in sequence as the customer scrolls
- Identify decision points and conversion moments throughout the page
- Note potential friction points and drop-off areas
- End with the primary conversion action and next steps
- Use numbered steps that reflect the actual page flow and content order
- Dont be overly detailed, just enough to get the point across, 1 sentence per step.

ANALYSIS DEPTH REQUIRED: Your analysis must be comprehensive enough to justify a $5,000+ consulting fee. Every recommendation must be:
1. Backed by industry-specific conversion psychology principles
2. Tailored to the identified page type and user intent
3. Appropriate for the purchase behavior type (high vs low consideration)
4. Detailed with step-by-step implementation
5. Prioritized by conversion impact potential for this specific context
6. Supported by industry-specific benchmarks and best practices

OUTPUT QUALITY: This analysis should read like a professional consulting report that demonstrates deep understanding of the specific industry, page type, and customer psychology.`;

  const userMessage = `COMPREHENSIVE CRO AUDIT REQUEST: Conduct a detailed, professional-grade conversion optimization analysis worth $5,000+ in consulting value.

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
HEADINGS (Hierarchy & Positioning):
${rawData.structuredContent.headings.map((h: any) => `${h.tag.toUpperCase()}: "${h.text}" (${h.position.top}px from top, Font: ${h.styles.fontSize}/${h.styles.fontWeight})`).join('\n')}

BUTTONS & CTAs (All Interactive Elements):
${rawData.structuredContent.buttons.map((b: any) => `${b.tag.toUpperCase()}: "${b.text}" (${b.position.top}px from top, ${b.position.width}x${b.position.height}px, BG: ${b.styles.backgroundColor}, Color: ${b.styles.color})`).join('\n')}

FORMS (Conversion Friction Points):
${rawData.structuredContent.forms.length > 0 ? rawData.structuredContent.forms.map((f: any, i: number) => `Form ${i+1}: ${f.totalFields} total fields, ${f.requiredFields} required, Action: "${f.action}", Method: ${f.method}`).join('\n') : 'NO FORMS DETECTED ON PAGE'}

NAVIGATION LINKS:
${rawData.structuredContent.links.slice(0, 15).map((l: any) => `"${l.text}" -> ${l.href}`).join('\n')}

KEY CONVERSION ELEMENTS (For Customer Journey Mapping):
MAIN CTAs: ${rawData.structuredContent.buttons.filter((b: any) => b.text && b.text.trim()).map((b: any) => `"${b.text}"`).join(', ')}
SECTION FLOW: ${rawData.structuredContent.sections.slice(0, 8).map((s: any, i: number) => `${i+1}. ${s.textPreview.substring(0, 60)}...`).join(' → ')}

CONTENT LISTS:
${rawData.structuredContent.lists.map((l: any) => `${l.tag.toUpperCase()}: ${l.itemCount} items - ${l.items.slice(0, 3).join(', ')}${l.items.length > 3 ? '...' : ''}`).join('\n')}

PAGE SECTIONS:
${rawData.structuredContent.sections.map((s: any) => `${s.tag.toUpperCase()} (class: "${s.class}", id: "${s.id}"): "${s.textPreview.substring(0, 120)}..."`).join('\n')}

${screenshots.length > 1 ? `=== VISUAL ANALYSIS ===
You have access to ${screenshots.length} sequential screenshots of the complete page from top to bottom. Use these to analyze:
- Visual hierarchy and user flow
- CTA prominence and placement
- Design consistency across sections
- Mobile responsiveness
- Color scheme effectiveness
- Overall visual polish and trust signals` : screenshots.length === 1 ? `=== VISUAL ANALYSIS ===
You have access to a screenshot of the page. Use this to analyze:
- Visual hierarchy and user flow
- CTA prominence and placement
- Design quality and trust signals
- Color scheme effectiveness
- Overall visual polish` : ''}

=== ANALYSIS REQUIREMENTS ===

CRITICAL REQUIREMENTS:
- Only analyze elements that actually exist on the page - do NOT invent or hallucinate content
- NEVER include percentage improvement estimates or conversion lift numbers
- Focus on unique, actionable insights - avoid repeating the same recommendations across sections
- If no forms exist, omit the forms section entirely
- Each recommendation should be distinct and non-overlapping
- Do NOT use em Dashes in the analysis

ANALYSIS STRUCTURE:

1. **CONTEXT ANALYSIS FIRST** (Mandatory)
   - Identify business type/industry and apply industry-specific expertise
   - Determine page type and adapt analysis framework accordingly  
   - Assess purchase behavior type (high vs low consideration) and tailor approach
   - Establish industry-specific benchmarks and best practices

2. **PAGE SUMMARY** 
   - Business type, audience, and conversion goals with industry context
   - Page type and its role in the conversion funnel
   - Purchase behavior analysis and implications
   - Detailed customer journey analysis: Start with how customers arrive at this page, then map each step they take through the page content toward conversion, including decision points and potential drop-off areas
   - Top 3 strengths and top 3 weaknesses

3. **ACTIONABLE RECOMMENDATIONS** 
   - 5-7 prioritized, industry-specific recommendations with implementation details
   - Psychological principles behind each recommendation (adapted for purchase behavior type)
   - Effort level and timeline for each
   - Industry-specific best practices and benchmarks
   - Compelling emotionally & logically charged copy suggestions

4. **QUICK WINS**
   - 3-5 high-impact, low-effort improvements that can be done immediately
   - Tailored to the specific page type and business model

5. **VISUAL CRO ANALYSIS** (For Visual Analysis Only)
   As a $10,000/day CRO auditor, provide dedicated visual conversion analysis:
   - VISUAL FLOW ANALYSIS: How does the eye naturally flow through the page? Do colors and content hierarchy guide users toward CTAs? Are there visual distractions that pull attention away from conversion goals?
   - COLOR & CONTRAST EVALUATION: How effective are the color choices for conversion? Is there sufficient contrast for readability and CTA prominence? Do colors create the right emotional response for the target audience?
   - CRITICAL VISUAL ISSUE: What's the single biggest visual problem preventing conversions? Focus on business impact and user behavior. Provide clear, non-technical solutions that marketers and executives can understand and implement. Avoid technical details like hex codes, pixel measurements, or CSS specifications. Instead, describe the problem in terms of user experience and business outcomes, then provide simple, actionable solutions that can be communicated to designers and developers.

Return analysis as JSON with this ENHANCED structure:
{
  "starRating": 2,
  "pageSummary": {
    "businessType": "B2B SaaS - Project Management Software",
    "industryContext": "High-consideration B2B software purchase requiring trust building and detailed feature explanation",
    "pageType": "Pricing Page",
    "purchaseBehaviorType": "high-consideration",
    "primaryConversionGoal": "Upgrade to paid plan or start trial", 
    "targetAudience": "Team leaders and project managers at mid-size companies",
    "currentUserJourney": [
      "1. Arrive on page (likely from search for ADHD symptoms/clinics)",
      "2. Identify with common ADHD symptoms and challenges",
      "3. Understand the problem of undiagnosed ADHD and traditional care barriers", 
      "4. Learn how Frida provides a solution (online, accessible, affordable)",
      "5. Review social proof and success stories",
      "6. Understand the 'how it works' process",
      "7. Evaluate expert credentials and service offerings",
      "8. Consider pricing and FAQs",
      "9. Take the 'Free ADHD Symptoms Test' as a low-commitment first step"
    ],
    "keyStrengths": ["Clear pricing tiers", "Industry-standard features", "Professional design"],
    "criticalWeaknesses": ["Weak social proof for enterprise segment", "No risk mitigation messaging", "Missing implementation support details"]
  },
  "recommendations": [
    {
      "title": "Add Enterprise Social Proof Section",
      "priority": "critical",
      "issue": "B2B buyers need validation from similar companies before committing to paid plans",
      "solution": "Create dedicated section with enterprise customer logos, case studies, and ROI metrics specific to project management efficiency",
      "implementation": ["Collect customer success metrics", "Design enterprise social proof section", "Add above pricing table", "Include industry-specific ROI data"],
      "psychologyBehind": "B2B high-consideration purchases require social proof from peers to reduce perceived risk and validate decision-making",
      "industryContext": "SaaS pricing pages convert 23% better with prominent customer logos and specific ROI metrics",
      "effort": 3,
      "timeline": "1-2 weeks"
    }
  ],
  "quickWins": [
    {
      "title": "Add Risk-Free Trial Messaging",
      "description": "Emphasize 'No credit card required' and 'Cancel anytime' messaging prominently near CTAs",
      "rationale": "Reduces commitment anxiety for high-consideration purchases",
      "effort": 1,
      "timeline": "Same day"
    }
  ],
  "visualCROAnalysis": {
    "visualFlow": {
      "eyeFlowPath": "Hero → Value Prop → Social Proof → CTA",
      "flowScore": 7,
      "guidesToCTA": true,
      "distractions": ["Competing CTAs in sidebar", "Too many color variations"]
    },
    "colorContrast": {
      "ctaContrast": "Excellent - 4.8:1 ratio",
      "readability": "Good overall", 
      "emotionalResponse": "Trust-building blues with conversion-optimized orange CTAs",
      "contrastScore": 8
    },
    "criticalIssue": {
      "problem": "Primary CTA blends with background reducing click-through rates",
      "solution": "Make the main call-to-action button stand out with a contrasting color that draws attention. Use a bright, action-oriented color that creates visual separation from the background. Ensure the button text is clearly readable and the overall design encourages clicks.",
      "impact": "High - likely 15-20% conversion increase",
      "urgency": "Critical"
    }
  },
  "executiveSummary": [
    "Context: B2B SaaS pricing page for high-consideration software purchase requiring trust and risk mitigation",
    "Key insight: Missing critical trust signals and implementation clarity needed for enterprise buyers",
    "Priority focus: Add enterprise social proof and implementation support messaging to reduce buyer anxiety",
    "Industry benchmark: Current approach missing 40% of conversion elements typical in high-converting B2B SaaS pricing pages"
  ],
  "copySuggestions": [
    {
      "section": "Primary CTA",
      "suggestion": "Start Free Trial - No Credit Card Required"
    },
    {
      "section": "Risk Mitigation", 
      "suggestion": "Join 2,500+ teams already saving 40% on project delivery time"
    }
  ]
}

STAR RATING CRITERIA:
⭐ (1 Star) - Major Issues: 5+ critical problems, missing basic conversion elements (clear value prop, primary CTA, trust signals), poor UX/mobile experience, not optimized for industry/page type
⭐⭐ (2 Stars) - Good Foundation: 2-4 significant opportunities, basic elements present but not optimized for industry/purchase behavior, decent user experience but missing key conversion triggers
⭐⭐⭐ (3 Stars) - Well Optimized: 1-2 minor improvements possible, strong industry-appropriate conversion fundamentals, good psychology implementation, well-designed for target audience and page type`;

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

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
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
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
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
    // Filter buttons to remove empty/tracking ones
    buttons: structuredContent.buttons?.filter((button: any) => {
      if (!button.text || button.text.trim() === '') return false;
      
      const lowerText = button.text.toLowerCase();
      const skipPatterns = [
        'accept all', 'manage consent', 'cookie settings', 'privacy settings',
        'opt out', 'confirm my choices', 'back button', 'apply', 'cancel'
      ];
      
      return !skipPatterns.some((pattern: string) => lowerText.includes(pattern));
    }) || [],
    
    // Filter links to remove footer/legal ones
    links: structuredContent.links?.filter((link: any) => {
      if (!link.text || link.text.trim() === '') return false;
      
      const lowerText = link.text.toLowerCase();
      const lowerHref = link.href?.toLowerCase() || '';
      
      const skipPatterns = [
        'privacy policy', 'terms of use', 'terms of service', 'cookie policy',
        'careers', 'contact us', 'about us', 'home', 'support', 'help',
        'copyright', '©', 'powered by', 'email us', 'phone:', 'fax:',
        'linkedin', 'twitter', 'facebook', 'youtube', 'instagram',
        'skip to', 'log in', 'login'
      ];
      
      if (skipPatterns.some((pattern: string) => lowerText.includes(pattern) || lowerHref.includes(pattern))) {
        return false;
      }
      
      if (lowerText.includes('skip to') || link.href?.startsWith('#')) {
        return false;
      }
      
      return true;
    }).slice(0, 10) || [],
    
    // Clean sections to remove CSS classes
    sections: structuredContent.sections?.map((section: any) => ({
      ...section,
      class: cleanClassName(section.class),
      textPreview: cleanSectionText(section.textPreview)
    })) || []
  };
}

function cleanClassName(className: string): string {
  if (!className) return '';
  
  const classes = className.split(' ').filter((cls: string) => {
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
    
    // Optional cleanup after 4 days (double the cache duration for safety)
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
    }, 4 * 24 * 60 * 60 * 1000);
    
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
        images: [] 
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
      openaiModel: 'gpt-4o-mini',
      geminiModel: 'gemini-1.5-flash',
      fullPageScreenshot: false,
      openaiApiKey: '',
      geminiApiKey: ''
    };
    
    const settings = { ...defaultSettings, ...(settingsResponse.data || {}) };
    console.log(`🤖 [Offscreen] Settings retrieved:`, { 
      provider: settings.provider, 
      hasApiKey: !!(settings.openaiApiKey || settings.geminiApiKey),
      openaiKeyLength: settings.openaiApiKey?.length || 0,
      geminiKeyLength: settings.geminiApiKey?.length || 0,
      rawSettingsData: settingsResponse.data
    });
    
    const apiKey = settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;
    if (!apiKey) {
      throw new Error(`${settings.provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key not configured`);
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