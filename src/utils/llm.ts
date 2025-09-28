import { RawPageData, LLMAnalysis, ExtensionSettings } from '../types';
import { ScreenshotCapture } from './screenshot';

export class LLMAnalyzer {
  private settings: ExtensionSettings;

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
  }

  async analyzeRawPageData(rawData: RawPageData, useFullPageScreenshots: boolean = false): Promise<LLMAnalysis> {
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

=== ANALYSIS REQUIREMENTS ===

CRITICAL REQUIREMENTS:
- Only analyze elements that actually exist on the page - do NOT invent or hallucate content
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
   - Compeling emotionaly & logically charged copy suggestions

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

    // Call appropriate API based on provider - NOTE: Screenshots are now pre-captured by background script
    let content: string;
    console.log('LLM Analysis starting - Provider:', this.settings.provider, 'Full Page:', useFullPageScreenshots);
    console.log('IMPORTANT: This method should NOT be called directly anymore. Use background script instead.');
    
    // This method is now deprecated in favor of the offscreen document approach
    // Screenshots should be pre-captured and passed in, not captured here
    throw new Error('LLMAnalyzer.analyzeRawPageData() is deprecated. Use background script with offscreen document instead.');
    
    // Legacy code below - kept for reference but should not execute
    if (this.settings.provider === 'gemini') {
      content = await this.callGeminiAPI(systemMessage, userMessage);
    } else {
      content = await this.callOpenAIAPI(systemMessage, userMessage);
    }

    console.log('LLM API Response content length:', content?.length);
    console.log('LLM API Response preview:', content?.substring(0, 500));
    
    if (!content || content.trim() === '') {
      throw new Error('No response content from LLM');
    }

    try {
      let analysis: any;
      
      // Try to parse as JSON first
      try {
        analysis = JSON.parse(content);
      } catch (parseError) {
        // If direct parsing fails, try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const firstMatch = jsonMatch?.[0];
        if (firstMatch && typeof firstMatch === 'string') {
          analysis = JSON.parse(firstMatch as string);
        } else {
          throw new Error('No valid JSON found in response');
        }
      }
      
      return this.validateAndSanitizeAnalysis(analysis);
    } catch (error) {
      console.error('LLM Response:', content);
      throw new Error(`Failed to parse LLM response: ${error}. Response: ${content.substring(0, 200)}...`);
    }
  }

  private validateAndSanitizeAnalysis(analysis: any): LLMAnalysis {
    // Log the raw analysis for debugging
    console.log('Raw LLM Analysis:', analysis);
    console.log('Raw quickWins:', analysis.quickWins);
    console.log('Raw visualCROAnalysis:', analysis.visualCROAnalysis);
    
    // Provide sensible defaults for missing fields
    const result = {
      starRating: (analysis.starRating === 1 || analysis.starRating === 2 || analysis.starRating === 3) ? analysis.starRating : 2 as 1 | 2 | 3,
      primaryConversion: analysis.primaryConversion || 'Primary CTA click',
      executiveSummary: Array.isArray(analysis.executiveSummary) ? analysis.executiveSummary : ['Analysis completed'],
      topFixes: this.validateTopFixes(analysis.topFixes),
      checklist: this.validateChecklist(analysis.checklist),
      copySuggestions: Array.isArray(analysis.copySuggestions) ? analysis.copySuggestions : undefined,
      // Pass through comprehensive analysis sections
      pageSummary: analysis.pageSummary,
      conversionAnalysis: analysis.conversionAnalysis,
      currentStateAnalysis: analysis.currentStateAnalysis,
      recommendations: analysis.recommendations,
      quickWins: analysis.quickWins,
      implementationRoadmap: analysis.implementationRoadmap,
      psychologyInsights: analysis.psychologyInsights,
      competitiveBenchmarks: analysis.competitiveBenchmarks,
      visualCROAnalysis: analysis.visualCROAnalysis
    };
    
    console.log('Validated Analysis:', result);
    console.log('Validated quickWins:', result.quickWins);
    return result;
  }

  private async callOpenAIAPI(systemMessage: string, userMessage: string): Promise<string> {
    const modelName = this.settings.openaiModel;
    const apiKey = this.settings.openaiApiKey;

    const requestBody: any = {
      model: modelName,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ]
    };

    // Configure parameters based on model
    if (modelName.startsWith('gpt-5')) {
      // GPT-5 models use max_completion_tokens and default temperature
      requestBody.max_completion_tokens = 8192;
      requestBody.response_format = { type: 'json_object' };
    } else if (modelName.includes('gpt-4') || modelName.includes('gpt-3.5')) {
      // GPT-4 and older models use max_tokens and support custom temperature
      requestBody.max_tokens = 8192;
      requestBody.temperature = 0.3;
      requestBody.response_format = { type: 'json_object' };
    } else {
      // Fallback for any other models
      requestBody.max_tokens = 8192;
      requestBody.temperature = 0.3;
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('OpenAI API response structure:', {
      choices: data.choices?.length || 0,
      hasMessage: !!data.choices?.[0]?.message,
      hasContent: !!data.choices?.[0]?.message?.content,
      error: data.error
    });
    
    if (data.error) {
      console.error('OpenAI API Error:', data.error);
      throw new Error(`OpenAI API Error: ${data.error.message || 'Unknown error'}`);
    }
    
    const content = data.choices?.[0]?.message?.content || '';
    console.log('Extracted content length:', content.length);
    
    if (content.length === 0) {
      console.error('Empty content from OpenAI. Full response:', JSON.stringify(data, null, 2));
    }
    
    return content;
  }

  private async callOpenAIAPIWithImage(systemMessage: string, userMessage: string, screenshot: string): Promise<string> {
    const modelName = this.settings.openaiModel;
    const apiKey = this.settings.openaiApiKey;

    // Enhanced prompt for visual analysis (similar to Gemini approach)
    const visualAnalysisPrompt = `${systemMessage}

ENHANCED VISUAL ANALYSIS CAPABILITIES:
You now have access to a screenshot of the landing page along with the text content. This enables comprehensive visual + content analysis that provides significantly more value than text-only analysis.

VISUAL ANALYSIS REQUIREMENTS:
- Analyze visual hierarchy and how the eye flows through the page
- Assess CTA button prominence, color contrast, and visual weight
- Evaluate design quality, professional appearance, and trust signals
- Check mobile responsiveness and touch target sizing
- Identify visual friction points and design inconsistencies
- Assess color scheme effectiveness for conversion psychology
- Analyze spacing, alignment, and overall visual polish

ENHANCED RECOMMENDATIONS:
- Provide specific visual improvements with design rationale
- Reference exact visual elements you can see in the screenshot
- Compare visual hierarchy against conversion best practices
- Suggest specific color, sizing, and positioning improvements
- Identify visual trust signals that are missing or weak

${userMessage}

IMPORTANT: Use both the screenshot and text content to provide a comprehensive analysis that combines visual design insights with content strategy recommendations.`;

    const requestBody: any = {
      model: modelName,
      messages: [
        { 
          role: 'user', 
          content: [
            {
              type: 'text',
              text: visualAnalysisPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${screenshot}`,
                detail: 'high'
              }
            }
          ]
        }
      ]
    };

    // Configure parameters based on model
    if (modelName.startsWith('gpt-5')) {
      // GPT-5 models use max_completion_tokens and default temperature
      requestBody.max_completion_tokens = 8192;
      requestBody.response_format = { type: 'json_object' };
    } else if (modelName.includes('gpt-4') || modelName.includes('gpt-3.5')) {
      // GPT-4 and older models use max_tokens and support custom temperature
      requestBody.max_tokens = 8192;
      requestBody.temperature = 0.3;
      requestBody.response_format = { type: 'json_object' };
    } else {
      // Fallback for any other models
      requestBody.max_tokens = 8192;
      requestBody.temperature = 0.3;
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('OpenAI API response structure:', {
      choices: data.choices?.length || 0,
      hasMessage: !!data.choices?.[0]?.message,
      hasContent: !!data.choices?.[0]?.message?.content,
      error: data.error
    });
    
    if (data.error) {
      console.error('OpenAI API Error:', data.error);
      throw new Error(`OpenAI API Error: ${data.error.message || 'Unknown error'}`);
    }
    
    const content = data.choices?.[0]?.message?.content || '';
    console.log('Extracted content length:', content.length);
    
    if (content.length === 0) {
      console.error('Empty content from OpenAI. Full response:', JSON.stringify(data, null, 2));
    }
    
    return content;
  }

  private async callGeminiAPI(systemMessage: string, userMessage: string): Promise<string> {
    const modelName = this.settings.geminiModel;
    const apiKey = this.settings.geminiApiKey;

    // Combine system and user messages for Gemini
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
    console.log('Gemini API response structure:', {
      candidates: data.candidates?.length || 0,
      hasContent: !!data.candidates?.[0]?.content,
      hasParts: !!data.candidates?.[0]?.content?.parts,
      hasText: !!data.candidates?.[0]?.content?.parts?.[0]?.text,
      error: data.error
    });
    
    if (data.error) {
      console.error('Gemini API Error:', data.error);
      throw new Error(`Gemini API Error: ${data.error.message || 'Unknown error'}`);
    }
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Extracted content length:', content.length);
    
    if (content.length === 0) {
      console.error('Empty content from Gemini. Full response:', JSON.stringify(data, null, 2));
    }
    
    return content;
  }

  private async callGeminiAPIWithImage(systemMessage: string, userMessage: string, screenshot: string): Promise<string> {
    const modelName = this.settings.geminiModel;
    const apiKey = this.settings.geminiApiKey;

    // Enhanced prompt for visual analysis
    const visualAnalysisPrompt = `${systemMessage}

ENHANCED VISUAL ANALYSIS CAPABILITIES:
You now have access to a screenshot of the landing page along with the text content. This enables comprehensive visual + content analysis that provides significantly more value than text-only analysis.

VISUAL ANALYSIS REQUIREMENTS:
- Analyze visual hierarchy and how the eye flows through the page
- Assess CTA button prominence, color contrast, and visual weight
- Evaluate design quality, professional appearance, and trust signals
- Check mobile responsiveness and touch target sizing
- Identify visual friction points and design inconsistencies
- Assess color scheme effectiveness for conversion psychology
- Analyze spacing, alignment, and overall visual polish

ENHANCED RECOMMENDATIONS:
- Provide specific visual improvements with design rationale
- Reference exact visual elements you can see in the screenshot
- Compare visual hierarchy against conversion best practices
- Suggest specific color, sizing, and positioning improvements
- Identify visual trust signals that are missing or weak

${userMessage}

IMPORTANT: Use both the screenshot and text content to provide a comprehensive analysis that combines visual design insights with content strategy recommendations.`;

    const requestBody = {
      contents: [{
        parts: [
          {
            text: visualAnalysisPrompt
          },
          {
            inline_data: {
              mime_type: "image/png",
              data: screenshot
            }
          }
        ]
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
    console.log('Gemini API response structure:', {
      candidates: data.candidates?.length || 0,
      hasContent: !!data.candidates?.[0]?.content,
      hasParts: !!data.candidates?.[0]?.content?.parts,
      hasText: !!data.candidates?.[0]?.content?.parts?.[0]?.text,
      error: data.error
    });
    
    if (data.error) {
      console.error('Gemini API Error:', data.error);
      throw new Error(`Gemini API Error: ${data.error.message || 'Unknown error'}`);
    }
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Extracted content length:', content.length);
    
    if (content.length === 0) {
      console.error('Empty content from Gemini. Full response:', JSON.stringify(data, null, 2));
    }
    
    return content;
  }

  private validateTopFixes(fixes: any): any[] {
    console.log('Validating top fixes:', fixes);
    if (!Array.isArray(fixes)) {
      console.log('Top fixes is not an array, returning empty array');
      return [];
    }
    
    return fixes.slice(0, 5).map((fix: any, index: number) => {
      console.log(`Processing fix ${index}:`, fix);
      return {
        title: fix.title || `Fix ${index + 1}`,
        why: fix.why || 'Analysis needed',
        how: fix.how || 'Implementation details needed',
        impact: Math.max(1, Math.min(5, fix.impact || 3)),
        effort: Math.max(1, Math.min(5, fix.effort || 3))
      };
    });
  }

  private validateChecklist(checklist: any): any[] {
    if (!Array.isArray(checklist)) {
      return [
        { area: 'Message clarity', result: 'neutral', note: 'Requires analysis' },
        { area: 'Friction', result: 'neutral', note: 'Requires analysis' },
        { area: 'Trust', result: 'neutral', note: 'Requires analysis' },
        { area: 'Visual hierarchy', result: 'neutral', note: 'Requires analysis' },
        { area: 'Offer strength', result: 'neutral', note: 'Requires analysis' },
        { area: 'Tracking readiness', result: 'neutral', note: 'Requires analysis' }
      ];
    }

    return checklist.map((item: any) => ({
      area: item.area || 'Unknown area',
      result: ['pass', 'fail', 'neutral'].includes(item.result) ? item.result : 'neutral',
      note: item.note || 'No details available'
    }));
  }

  /**
   * Call OpenAI API with multiple screenshots for full page analysis
   */
  private async callOpenAIAPIWithMultipleImages(systemMessage: string, userMessage: string, screenshots: string[]): Promise<string> {
    console.log('callOpenAIAPIWithMultipleImages called with', screenshots.length, 'screenshots');
    
    // Calculate total request size
    const totalSize = screenshots.reduce((sum, screenshot) => sum + screenshot.length, 0);
    console.log('Total screenshots size:', Math.round(totalSize / 1024 / 1024), 'MB');
    const modelName = this.settings.openaiModel;
    const apiKey = this.settings.openaiApiKey;

    // Enhanced prompt for full page visual analysis
    const fullPageAnalysisPrompt = `${systemMessage}

ENHANCED FULL-PAGE VISUAL ANALYSIS CAPABILITIES:
You now have access to ${screenshots.length} sequential screenshots of the complete landing page. These screenshots are captured from top to bottom, covering the entire page content. This enables comprehensive full-page visual + content analysis.

FULL-PAGE VISUAL ANALYSIS REQUIREMENTS:
- Analyze the complete visual hierarchy and user flow from top to bottom
- Assess how the page guides users through the conversion journey
- Evaluate visual consistency and design patterns across all sections
- Check CTA placement and visual prominence throughout the page
- Identify visual friction points and opportunities across the entire experience
- Assess mobile responsiveness and touch target sizing across all sections
- Analyze color scheme effectiveness and brand consistency throughout
- Evaluate spacing, alignment, and overall visual polish across the full page

SEQUENTIAL SCREENSHOT ANALYSIS:
- Screenshot 1 shows the top/hero section (above the fold)
- Screenshots 2-${screenshots.length} show sequential sections moving down the page
- Each screenshot represents one viewport height of content
- Analyze the flow and transition between sections

COMPREHENSIVE RECOMMENDATIONS:
- Provide specific visual improvements for each major section
- Reference exact visual elements you can see across all screenshots
- Compare visual hierarchy against conversion best practices for full-page experience
- Suggest specific improvements for user flow and conversion path optimization
- Identify sections that need visual strengthening or reorganization
- Recommend improvements for overall page cohesion and conversion optimization

${userMessage}

IMPORTANT: Use all ${screenshots.length} screenshots to provide a comprehensive full-page analysis that combines complete visual design insights with content strategy recommendations for the entire user journey.`;

    const contentParts: any[] = [
      {
        type: 'text',
        text: fullPageAnalysisPrompt
      }
    ];

    // Add all screenshots to the content
    screenshots.forEach((screenshot, index) => {
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

    // Configure parameters based on model type
    if (modelName.startsWith('gpt-5')) {
      // GPT-5 models use max_completion_tokens and default temperature
      requestBody.max_completion_tokens = 8192;
      requestBody.response_format = { type: 'json_object' };
    } else if (modelName.includes('gpt-4') || modelName.includes('gpt-3.5')) {
      // GPT-4 and older models use max_tokens and support custom temperature
      requestBody.max_tokens = 8192;
      requestBody.temperature = 0.3;
      requestBody.response_format = { type: 'json_object' };
    } else {
      // Fallback for other models
      requestBody.max_tokens = 8192;
      requestBody.temperature = 0.3;
    }

    console.log('Making OpenAI API request with:', {
      model: requestBody.model,
      messageCount: requestBody.messages.length,
      contentPartsCount: requestBody.messages[0].content.length,
      maxTokens: requestBody.max_tokens || requestBody.max_completion_tokens,
      temperature: requestBody.temperature
    });

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
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('OpenAI API response structure:', {
      choices: data.choices?.length || 0,
      hasMessage: !!data.choices?.[0]?.message,
      hasContent: !!data.choices?.[0]?.message?.content,
      error: data.error
    });
    
    if (data.error) {
      console.error('OpenAI API Error:', data.error);
      throw new Error(`OpenAI API Error: ${data.error.message || 'Unknown error'}`);
    }
    
    const content = data.choices?.[0]?.message?.content || '';
    console.log('Extracted content length:', content.length);
    
    if (content.length === 0) {
      console.error('Empty content from OpenAI. Full response:', JSON.stringify(data, null, 2));
    }
    
    return content;
  }

  /**
   * Call Gemini API with multiple screenshots for full page analysis
   */
  private async callGeminiAPIWithMultipleImages(systemMessage: string, userMessage: string, screenshots: string[]): Promise<string> {
    console.log('callGeminiAPIWithMultipleImages called with', screenshots.length, 'screenshots');
    
    // Calculate total request size
    const totalSize = screenshots.reduce((sum, screenshot) => sum + screenshot.length, 0);
    console.log('Total screenshots size:', Math.round(totalSize / 1024 / 1024), 'MB');
    const modelName = this.settings.geminiModel;
    const apiKey = this.settings.geminiApiKey;

    // Enhanced prompt for full page visual analysis
    const fullPageAnalysisPrompt = `${systemMessage}

ENHANCED FULL-PAGE VISUAL ANALYSIS CAPABILITIES:
You now have access to ${screenshots.length} sequential screenshots of the complete landing page. These screenshots are captured from top to bottom, covering the entire page content. This enables comprehensive full-page visual + content analysis.

FULL-PAGE VISUAL ANALYSIS REQUIREMENTS:
- Analyze the complete visual hierarchy and user flow from top to bottom
- Assess how the page guides users through the conversion journey
- Evaluate visual consistency and design patterns across all sections
- Check CTA placement and visual prominence throughout the page
- Identify visual friction points and opportunities across the entire experience
- Assess mobile responsiveness and touch target sizing across all sections
- Analyze color scheme effectiveness and brand consistency throughout
- Evaluate spacing, alignment, and overall visual polish across the full page

SEQUENTIAL SCREENSHOT ANALYSIS:
- Screenshot 1 shows the top/hero section (above the fold)
- Screenshots 2-${screenshots.length} show sequential sections moving down the page
- Each screenshot represents one viewport height of content
- Analyze the flow and transition between sections

COMPREHENSIVE RECOMMENDATIONS:
- Provide specific visual improvements for each major section
- Reference exact visual elements you can see across all screenshots
- Compare visual hierarchy against conversion best practices for full-page experience
- Suggest specific improvements for user flow and conversion path optimization
- Identify sections that need visual strengthening or reorganization
- Recommend improvements for overall page cohesion and conversion optimization

${userMessage}

IMPORTANT: Use all ${screenshots.length} screenshots to provide a comprehensive full-page analysis that combines complete visual design insights with content strategy recommendations for the entire user journey.`;

    const parts: any[] = [
      {
        text: fullPageAnalysisPrompt
      }
    ];

    // Add all screenshots to the parts
    screenshots.forEach((screenshot, index) => {
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Gemini API response structure:', {
      candidates: data.candidates?.length || 0,
      hasContent: !!data.candidates?.[0]?.content,
      hasParts: !!data.candidates?.[0]?.content?.parts,
      hasText: !!data.candidates?.[0]?.content?.parts?.[0]?.text,
      error: data.error
    });
    
    if (data.error) {
      console.error('Gemini API Error:', data.error);
      throw new Error(`Gemini API Error: ${data.error.message || 'Unknown error'}`);
    }
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Extracted content length:', content.length);
    
    if (content.length === 0) {
      console.error('Empty content from Gemini. Full response:', JSON.stringify(data, null, 2));
    }
    
    return content;
  }
}
