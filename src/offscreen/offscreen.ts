import { ExtensionSettings, RawPageData } from '../types';

console.log('Offscreen document loaded');

// Reset processing state on startup (in case of previous crashes)
setTimeout(() => {
  if (isProcessing) {
    console.warn('Resetting stuck processing flag on startup');
    isProcessing = false;
    processingStartTime = 0;
  }
}, 1000);

// Track processed messages to prevent duplicates
const processedMessages = new Set<string>();
let isProcessing = false;
let processingStartTime = 0;

// Message handler for offscreen document
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_ANALYZE') {
    console.log('Offscreen: Received analysis request:', message.messageId);
    
    // Check if already processing any message, but with timeout protection
    const now = Date.now();
    if (isProcessing) {
      const processingDuration = now - processingStartTime;
      
      // If processing for more than 5 minutes, assume it's stuck and reset
      if (processingDuration > 5 * 60 * 1000) {
        console.warn('Processing flag stuck for', processingDuration, 'ms, resetting...');
        isProcessing = false;
        processingStartTime = 0;
      } else {
        console.warn('Already processing a message, ignoring new request:', message.messageId, 'Duration:', processingDuration, 'ms');
        return true;
      }
    }
    
    // Check for duplicate messages
    if (processedMessages.has(message.messageId)) {
      console.warn('Duplicate message detected, ignoring:', message.messageId);
      return true;
    }
    
    // Mark as processing and add to processed set
    isProcessing = true;
    processingStartTime = now;
    processedMessages.add(message.messageId);
    console.log('Processing message:', message.messageId, 'at', new Date().toISOString());
    
    try {
      const { pageData, url, settings, screenshots = [] } = message.payload;
      
      console.log('Offscreen: Starting analysis for', url);
      console.log('Offscreen: Received', screenshots.length, 'screenshots');
      console.log('Offscreen: Page content size:', pageData.fullTextContent?.length || 0, 'characters');
      console.log('Offscreen: Screenshot details:', {
        count: screenshots.length,
        sizes: screenshots.map(s => s.length),
        previews: screenshots.map(s => s.substring(0, 50) + '...')
      });

      // Compress screenshots in offscreen context where DOM is available
      const compressedScreenshots: string[] = [];
      if (screenshots.length > 0) {
        console.log('Offscreen: Compressing screenshots...');
        for (let i = 0; i < screenshots.length; i++) {
          const originalSize = Math.floor(screenshots[i].length * 0.75);
          console.log(`Compressing screenshot ${i + 1}/${screenshots.length}: ${Math.round(originalSize / 1024)}KB`);
          
          try {
            const compressed = await compressScreenshotInOffscreen(screenshots[i], 0.4); // 60% reduction
            const compressedSize = Math.floor(compressed.length * 0.75);
            console.log(`Screenshot ${i + 1} compressed: ${Math.round(originalSize / 1024)}KB → ${Math.round(compressedSize / 1024)}KB (${Math.round((1 - compressedSize/originalSize) * 100)}% reduction)`);
            compressedScreenshots.push(compressed);
          } catch (compressionError) {
            console.warn(`Failed to compress screenshot ${i + 1}, using original:`, compressionError);
            compressedScreenshots.push(screenshots[i]);
          }
        }
        console.log('Offscreen: Screenshot compression completed');
      } else {
        console.log('Offscreen: No screenshots to compress');
      }
      
      // Convert page data to RawPageData format
      const rawData: RawPageData = {
        title: pageData.title,
        url: pageData.url,
        metaDescription: pageData.metaDescription,
        fullTextContent: pageData.fullTextContent,
        pageMetadata: pageData.pageMetadata,
        structuredContent: pageData.structuredContent
      };
      
      // Run analysis with compressed screenshots
      const analysis = await runLLMAnalysisWithScreenshots(rawData, settings, compressedScreenshots);
      
      console.log('Offscreen: Analysis completed successfully');
      
      // Send response back to background script with retry logic
      await sendResponseWithRetry({
        messageId: message.messageId,
        success: true,
        data: analysis
      });
      
    } catch (error) {
      console.error('Offscreen analysis error:', error);
      
      await sendResponseWithRetry({
        messageId: message.messageId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      // Reset processing flag and timestamp
      isProcessing = false;
      processingStartTime = 0;
      console.log('Processing completed for message:', message.messageId, 'at', new Date().toISOString());
      
      // Clean up processed message tracking (keep last 10 to prevent memory leaks)
      if (processedMessages.size > 10) {
        const messagesArray = Array.from(processedMessages);
        const toRemove = messagesArray.slice(0, messagesArray.length - 10);
        toRemove.forEach(id => processedMessages.delete(id));
      }
    }
    
    return true; // Keep message channel open
  }
});

// Custom LLM analysis method that works with pre-captured screenshots
async function runLLMAnalysisWithScreenshots(rawData: RawPageData, settings: ExtensionSettings, screenshots: string[]): Promise<any> {
  console.log('Running LLM analysis with', screenshots.length, 'screenshots');
  console.log('Content size:', rawData.fullTextContent?.length || 0, 'characters');
  
  // Build the analysis prompt (needed for both text-only and visual analysis)
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
${rawData.structuredContent.headings.map((h: any, i: number) => `${h.tag.toUpperCase()}: "${h.text}" (${h.position.top}px from top, Font: ${h.styles.fontSize}/${h.styles.fontWeight})`).join('\n')}

BUTTONS & CTAs (All Interactive Elements):
${rawData.structuredContent.buttons.map((b: any, i: number) => `${b.tag.toUpperCase()}: "${b.text}" (${b.position.top}px from top, ${b.position.width}x${b.position.height}px, BG: ${b.styles.backgroundColor}, Color: ${b.styles.color})`).join('\n')}

FORMS (Conversion Friction Points):
${rawData.structuredContent.forms.length > 0 ? rawData.structuredContent.forms.map((f: any, i: number) => `Form ${i+1}: ${f.totalFields} total fields, ${f.requiredFields} required, Action: "${f.action}", Method: ${f.method}`).join('\n') : 'NO FORMS DETECTED ON PAGE'}

NAVIGATION LINKS:
${rawData.structuredContent.links.slice(0, 15).map((l: any, i: number) => `"${l.text}" -> ${l.href}`).join('\n')}

CONTENT LISTS:
${rawData.structuredContent.lists.map((l: any, i: number) => `${l.tag.toUpperCase()}: ${l.itemCount} items - ${l.items.slice(0, 3).join(', ')}${l.items.length > 3 ? '...' : ''}`).join('\n')}

PAGE SECTIONS:
${rawData.structuredContent.sections.map((s: any, i: number) => `${s.tag.toUpperCase()} (class: "${s.class}", id: "${s.id}"): "${s.textPreview.substring(0, 120)}..."`).join('\n')}

${screenshots.length > 1 ? `=== VISUAL ANALYSIS ===
You have access to ${screenshots.length} sequential screenshots of the complete page from top to bottom. Use these to analyze:
- Visual hierarchy and user flow
- CTA prominence and placement
- Design consistency across sections
- Mobile responsiveness
- Color scheme effectiveness
- Overall visual polish and trust signals` : `=== VISUAL ANALYSIS ===
You have access to a screenshot of the page. Use this to analyze:
- Visual hierarchy and user flow
- CTA prominence and placement
- Design quality and trust signals
- Color scheme effectiveness
- Overall visual polish`}

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
   - Current user journey and key issues specific to this context
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
    "currentUserJourney": ["Research solutions", "Compare features", "Evaluate pricing", "Seek social proof", "Trial or purchase"],
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
    },
    {
      "title": "Add Implementation and Support Messaging",
      "priority": "high", 
      "issue": "High-consideration buyers worry about implementation complexity and ongoing support",
      "solution": "Add dedicated section explaining onboarding process, implementation timeline, and support options",
      "implementation": ["Create implementation timeline graphic", "Add support team information", "Include onboarding process overview", "Add customer success manager details"],
      "psychologyBehind": "Reducing implementation anxiety is crucial for high-consideration B2B software purchases",
      "industryContext": "B2B SaaS with clear implementation messaging see 31% higher trial-to-paid conversion",
      "effort": 2,
      "timeline": "3-5 days"
    }
  ],
  "quickWins": [
    {
      "title": "Add Risk-Free Trial Messaging",
      "description": "Emphasize 'No credit card required' and 'Cancel anytime' messaging prominently near CTAs",
      "rationale": "Reduces commitment anxiety for high-consideration purchases",
      "effort": 1,
      "timeline": "Same day"
    },
    {
      "title": "Add Pricing FAQ Section",
      "description": "Address common B2B concerns: billing cycles, seat management, data security, integrations",
      "rationale": "Preemptively answers objections specific to B2B software purchases",
      "effort": 2, 
      "timeline": "2-3 days"
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

  // Check if we have screenshots or need text-only analysis
  if (screenshots.length === 0) {
    // No screenshots - run text-only analysis using our custom functions
    if (settings.provider === 'gemini') {
      return await callGeminiAPITextOnly(systemMessage, userMessage, settings);
    } else {
      return await callOpenAIAPITextOnly(systemMessage, userMessage, settings);
    }
  }

  // Call the appropriate API with screenshots
  if (settings.provider === 'gemini') {
    return await callGeminiAPIWithScreenshots(systemMessage, userMessage, screenshots, settings);
  } else {
    return await callOpenAIAPIWithScreenshots(systemMessage, userMessage, screenshots, settings);
  }
}

// Gemini API call with screenshots
async function callGeminiAPIWithScreenshots(systemMessage: string, userMessage: string, screenshots: string[], settings: ExtensionSettings): Promise<any> {
  const modelName = settings.geminiModel;
  const apiKey = settings.geminiApiKey;

  const combinedPrompt = `${systemMessage}\n\n${userMessage}`;

  const parts: any[] = [
    {
      text: combinedPrompt
    }
  ];

  // Add all screenshots to the parts
  screenshots.forEach((screenshot) => {
    parts.push({
      inline_data: {
        mime_type: "image/png",
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
      maxOutputTokens: 8192,
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

  // Validate response before parsing
  if (!validateJSONResponse(content)) {
    console.warn('Response validation failed, but attempting to parse anyway...');
  }

  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error('JSON parsing error in callGeminiAPIWithScreenshots:', parseError);
    console.error('Raw content length:', content.length);
    console.error('Raw content preview:', content.substring(0, 500) + '...');
    console.error('Raw content ending:', '...' + content.substring(Math.max(0, content.length - 500)));
    
    // Try to repair truncated JSON
    const repairedContent = attemptJSONRepair(content);
    if (repairedContent) {
      try {
        console.log('Attempting to parse repaired JSON...');
        return JSON.parse(repairedContent);
      } catch (repairError) {
        console.error('Repaired JSON also failed to parse:', repairError);
      }
    }
    
    throw new Error(`Invalid JSON response from Gemini API: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
  }
}

// OpenAI API call with screenshots
async function callOpenAIAPIWithScreenshots(systemMessage: string, userMessage: string, screenshots: string[], settings: ExtensionSettings): Promise<any> {
  const modelName = settings.openaiModel;
  const apiKey = settings.openaiApiKey;

  const contentParts: any[] = [
    {
      type: 'text',
      text: `${systemMessage}\n\n${userMessage}`
    }
  ];

  // Add all screenshots to the content
  screenshots.forEach((screenshot) => {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${screenshot}`,
        detail: 'high'
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
    requestBody.max_completion_tokens = 8192;
    requestBody.response_format = { type: 'json_object' };
  } else if (modelName.includes('gpt-4') || modelName.includes('gpt-3.5')) {
    requestBody.max_tokens = 8192;
    requestBody.temperature = 0.3;
    requestBody.response_format = { type: 'json_object' };
  } else {
    requestBody.max_tokens = 8192;
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

  // Validate response before parsing
  if (!validateJSONResponse(content)) {
    console.warn('Response validation failed, but attempting to parse anyway...');
  }

  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error('JSON parsing error in callOpenAIAPIWithScreenshots:', parseError);
    console.error('Raw content length:', content.length);
    console.error('Raw content preview:', content.substring(0, 500) + '...');
    console.error('Raw content ending:', '...' + content.substring(Math.max(0, content.length - 500)));
    
    // Try to repair truncated JSON
    const repairedContent = attemptJSONRepair(content);
    if (repairedContent) {
      try {
        console.log('Attempting to parse repaired JSON...');
        return JSON.parse(repairedContent);
      } catch (repairError) {
        console.error('Repaired JSON also failed to parse:', repairError);
      }
    }
    
    throw new Error(`Invalid JSON response from OpenAI API: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
  }
}

// Text-only API calls (no screenshots)
async function callGeminiAPITextOnly(systemMessage: string, userMessage: string, settings: ExtensionSettings): Promise<any> {
  const modelName = settings.geminiModel;
  const apiKey = settings.geminiApiKey;

  const combinedPrompt = `${systemMessage}\n\n${userMessage}`;

  const requestBody = {
    contents: [{
      parts: [{
        text: combinedPrompt
      }]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
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

  // Validate response before parsing
  if (!validateJSONResponse(content)) {
    console.warn('Response validation failed, but attempting to parse anyway...');
  }

  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error('JSON parsing error in callGeminiAPITextOnly:', parseError);
    console.error('Raw content length:', content.length);
    console.error('Raw content preview:', content.substring(0, 500) + '...');
    console.error('Raw content ending:', '...' + content.substring(Math.max(0, content.length - 500)));
    
    // Try to repair truncated JSON
    const repairedContent = attemptJSONRepair(content);
    if (repairedContent) {
      try {
        console.log('Attempting to parse repaired JSON...');
        return JSON.parse(repairedContent);
      } catch (repairError) {
        console.error('Repaired JSON also failed to parse:', repairError);
      }
    }
    
    throw new Error(`Invalid JSON response from Gemini API: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
  }
}

async function callOpenAIAPITextOnly(systemMessage: string, userMessage: string, settings: ExtensionSettings): Promise<any> {
  const modelName = settings.openaiModel;
  const apiKey = settings.openaiApiKey;

  const requestBody: any = {
    model: modelName,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ]
  };

  // Configure parameters based on model
  if (modelName.startsWith('gpt-5')) {
    requestBody.max_completion_tokens = 8192;
    requestBody.response_format = { type: 'json_object' };
  } else if (modelName.includes('gpt-4') || modelName.includes('gpt-3.5')) {
    requestBody.max_tokens = 8192;
    requestBody.temperature = 0.3;
    requestBody.response_format = { type: 'json_object' };
  } else {
    requestBody.max_tokens = 8192;
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

  // Validate response before parsing
  if (!validateJSONResponse(content)) {
    console.warn('Response validation failed, but attempting to parse anyway...');
  }

  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error('JSON parsing error in callOpenAIAPITextOnly:', parseError);
    console.error('Raw content length:', content.length);
    console.error('Raw content preview:', content.substring(0, 500) + '...');
    console.error('Raw content ending:', '...' + content.substring(Math.max(0, content.length - 500)));
    
    // Try to repair truncated JSON
    const repairedContent = attemptJSONRepair(content);
    if (repairedContent) {
      try {
        console.log('Attempting to parse repaired JSON...');
        return JSON.parse(repairedContent);
      } catch (repairError) {
        console.error('Repaired JSON also failed to parse:', repairError);
      }
    }
    
    throw new Error(`Invalid JSON response from OpenAI API: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
  }
}

/**
 * Validate JSON response structure before parsing
 */
function validateJSONResponse(content: string): boolean {
  try {
    const trimmed = content.trim();
    
    // Basic structure checks
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      console.log('JSON validation failed: Does not start with { or end with }');
      return false;
    }
    
    // Check for required fields in our expected response structure
    const hasStarRating = trimmed.includes('"starRating"');
    const hasPageSummary = trimmed.includes('"pageSummary"');
    const hasRecommendations = trimmed.includes('"recommendations"');
    
    if (!hasStarRating || !hasPageSummary || !hasRecommendations) {
      console.log('JSON validation failed: Missing required fields');
      return false;
    }
    
    // Check for balanced braces (basic check)
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    
    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      
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
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        }
      }
    }
    
    if (braceCount !== 0) {
      console.log('JSON validation failed: Unbalanced braces');
      return false;
    }
    
    console.log('JSON validation passed');
    return true;
    
  } catch (error) {
    console.log('JSON validation error:', error);
    return false;
  }
}

/**
 * Attempt to repair truncated JSON by closing open structures
 */
function attemptJSONRepair(content: string): string | null {
  try {
    console.log('Attempting to repair truncated JSON...');
    
    // Remove any trailing whitespace
    let repaired = content.trim();
    
    // If it doesn't start with {, it's not JSON
    if (!repaired.startsWith('{')) {
      console.log('Content does not start with {, cannot repair');
      return null;
    }
    
    // Count open and close braces
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
    
    // If we're in the middle of a string, try to close it
    if (inString) {
      console.log('Detected unclosed string, attempting to close it');
      // Find the last quote and close the string
      const lastQuoteIndex = repaired.lastIndexOf('"');
      if (lastQuoteIndex > 0) {
        // Check if this quote is escaped
        let isEscaped = false;
        for (let i = lastQuoteIndex - 1; i >= 0; i--) {
          if (repaired[i] === '\\') {
            isEscaped = !isEscaped;
          } else {
            break;
          }
        }
        if (!isEscaped) {
          repaired = repaired.substring(0, lastQuoteIndex + 1);
        }
      }
    }
    
    // Close any open brackets first
    while (openBrackets > 0) {
      repaired += ']';
      openBrackets--;
    }
    
    // Close any open braces
    while (openBraces > 0) {
      repaired += '}';
      openBraces--;
    }
    
    console.log('JSON repair completed, attempting validation...');
    
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
 * Send response to background script with retry logic
 */
async function sendResponseWithRetry(response: any, maxRetries: number = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Try to wake up background script before sending
      if (attempt > 1) {
        await wakeUpBackgroundScript();
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Response timeout'));
        }, 8000); // Increased timeout

        chrome.runtime.sendMessage(response, (result) => {
          clearTimeout(timeout);
          
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Send failed'));
          } else {
            resolve();
          }
        });
      });
      
      console.log(`Successfully sent response on attempt ${attempt}`);
      return;
      
    } catch (error) {
      console.warn(`Response attempt ${attempt} failed:`, error);
      
      // Check if it's a connection error (background script idle)
      const isConnectionError = error instanceof Error && (
        error.message.includes('message port closed') ||
        error.message.includes('Extension context invalidated') ||
        error.message.includes('receiving end does not exist') ||
        error.message.includes('Response timeout')
      );

      if (isConnectionError) {
        console.log('Detected background script idle, attempting to wake it up...');
        await wakeUpBackgroundScript();
      }

      if (attempt === maxRetries) {
        console.error(`Failed to send response after ${maxRetries} attempts. Storing in fallback.`);
        // Store the response in local storage as fallback with enhanced metadata
        try {
          const fallbackKey = `offscreen_response_${response.messageId}`;
          const fallbackData = {
            ...response,
            timestamp: Date.now(),
            fallback: true,
            attempts: maxRetries,
            lastError: error instanceof Error ? error.message : 'Unknown error'
          };
          
          await chrome.storage.local.set({ [fallbackKey]: fallbackData });
          console.log('Response stored in fallback storage with key:', fallbackKey);
          
          // Also create a general marker for pending fallback responses
          const pendingKey = 'offscreen_pending_responses';
          const existing = await chrome.storage.local.get(pendingKey);
          const pending = existing[pendingKey] || [];
          pending.push({
            messageId: response.messageId,
            timestamp: Date.now(),
            key: fallbackKey
          });
          await chrome.storage.local.set({ [pendingKey]: pending });
          
        } catch (storageError) {
          console.error('Failed to store fallback response:', storageError);
        }
        return;
      }
      
      // Wait before retry with exponential backoff
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Cap at 10 seconds
      console.log(`Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

/**
 * Try to wake up the background script by sending a ping
 */
async function wakeUpBackgroundScript(): Promise<boolean> {
  try {
    console.log('Attempting to wake up background script...');
    
    const response = await new Promise<any>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ error: 'timeout' });
      }, 3000);

      chrome.runtime.sendMessage({ type: 'PING' }, (result) => {
        clearTimeout(timeout);
        resolve(result || { error: chrome.runtime.lastError?.message });
      });
    });

    if (response.pong) {
      console.log('Background script is now awake');
      return true;
    } else {
      console.warn('Background script ping failed:', response.error);
      return false;
    }
  } catch (error) {
    console.warn('Failed to ping background script:', error);
    return false;
  }
}

/**
 * Compress screenshot in offscreen context where DOM APIs are available
 */
async function compressScreenshotInOffscreen(base64Data: string, targetRatio: number = 0.4): Promise<string> {
  try {
    console.log(`Starting compression with target ratio: ${targetRatio}`);
    
    // Create canvas for compression
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    // Create image from base64
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = `data:image/png;base64,${base64Data}`;
    });

    console.log(`Original image dimensions: ${img.width}x${img.height}`);

    // Calculate dimensions for target compression - more aggressive reduction
    const dimensionRatio = Math.sqrt(targetRatio);
    const newWidth = Math.floor(img.width * dimensionRatio);
    const newHeight = Math.floor(img.height * dimensionRatio);

    console.log(`Target compressed dimensions: ${newWidth}x${newHeight} (${Math.round(dimensionRatio * 100)}% scale)`);

    // Resize image with better quality settings
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    // Use better image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    // Convert to JPEG with aggressive compression for token efficiency
    const jpegQuality = 0.6; // Fixed 60% quality for consistent compression
    const compressedDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    
    const result = compressedDataUrl.replace(/^data:image\/jpeg;base64,/, '');
    console.log('Compression completed successfully');
    
    return result;

  } catch (error) {
    console.warn('Screenshot compression failed, returning original image:', error);
    return base64Data;
  }
}

console.log('Offscreen document ready for analysis requests');
