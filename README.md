# Landing Page Converter - Chrome Extension

A Chrome extension that analyzes landing pages to maximize conversion likelihood for paid Google Ads traffic. Uses AI to provide actionable recommendations for improving conversion rates.

## Features

- **Dual AI Provider Support**: Choose between OpenAI (GPT-4.1, GPT-5) or Google Gemini (2.5 Pro, 2.5 Flash) models
- **Visual + Content Analysis**: Gemini users get enhanced screenshot analysis for comprehensive visual insights alongside content strategy
- **Industry-Aware AI Analysis**: Deep industry-specific knowledge for SaaS, E-commerce, B2B Services, Healthcare, Financial Services, and more
- **Page-Type Intelligence**: Automatically detects and adapts analysis for Homepage, Product Page, Landing Page, Pricing Page, or Content Page
- **Purchase Behavior Optimization**: Tailors recommendations for high-consideration vs. impulse purchases
- **Star Rating System**: Clear 1-3 star scoring with specific criteria for each level
- **Conversion Optimization**: Focuses specifically on paid Google Ads traffic with industry benchmarks
- **Executive Summary**: Clear, actionable recommendations in plain English with industry context
- **Impact vs Effort Analysis**: Prioritized list of recommendations with impact and effort ratings
- **Context-Aware Recommendations**: Considers business type, page type, and customer psychology
- **Copy Suggestions**: Industry-specific recommendations for headlines and CTAs
- **PDF Export**: Professional reports with Google styling
- **Smart Caching**: Saves results per URL to avoid re-analysis and save API costs
- **Token Efficient**: Optimized page summarization to minimize API costs

## Installation

### Prerequisites

- Node.js 18+ and npm
- Chrome browser
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

### Build Instructions

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd landing-page-converter
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```
   
   This will:
   - Build all TypeScript and assets with Vite
   - Copy the manifest file to the dist folder
   - Copy icons to the dist folder

3. **Load in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `dist` folder from your project directory

4. **Configure API Key:**
   - Click the extension icon in your toolbar
   - Click "Options" to open settings
   - Enter your OpenAI API key
   - Choose your preferred model (GPT-4o Mini recommended for best cost/quality balance)
   - Click "Save Settings"

## Usage

### Basic Analysis

1. **Navigate to any landing page** you want to analyze
2. **Click the extension icon** in your Chrome toolbar
3. **Click "Scan Page"** to start the analysis
4. **Wait for results** (typically 10-30 seconds)
5. **Review recommendations** in the popup

### Understanding Results

#### Star Rating System
- **⭐⭐⭐ (3 Stars)**: Well-optimized page with strong conversion fundamentals, only minor improvements possible
- **⭐⭐ (2 Stars)**: Good foundation with clear improvement opportunities, basic elements present but not fully optimized
- **⭐ (1 Star)**: Major issues requiring significant work, missing basic conversion elements or poor user experience

#### Visual Analysis (Gemini Users)
When using Gemini models, the extension automatically captures a screenshot for enhanced visual analysis:

- **Visual Hierarchy Assessment**: How the eye flows through the page and CTA prominence
- **Design Quality Analysis**: Professional appearance, color schemes, and visual trust signals
- **Mobile Responsiveness Check**: Touch target sizing and mobile layout optimization
- **Visual Friction Identification**: Design inconsistencies and conversion barriers
- **Color Psychology Insights**: Effectiveness of color choices for conversion optimization

**Note**: OpenAI users receive advanced text-based content analysis. Visual analysis is exclusively available with Gemini models.

#### Top 5 Fixes
Each fix includes:
- **Impact** (1-5): How much improvement this could provide
- **Effort** (1-5): How difficult this is to implement
- **Why**: Explanation of the issue
- **How**: Specific steps to fix it

#### Checklist Areas
- **Message Clarity**: Value proposition and benefit communication
- **Friction**: Form complexity and user experience barriers
- **Trust**: Social proof, policies, and credibility signals
- **Visual Hierarchy**: CTA prominence and design clarity
- **Offer Strength**: Incentives, urgency, and value communication
- **Tracking Readiness**: Analytics and conversion tracking setup

### Advanced Features

#### PDF Export
- Click "Export PDF" to generate a professional report
- Includes all analysis results with Google-styled formatting
- Perfect for sharing with stakeholders or clients

#### Caching
- Results are automatically cached per URL
- Returning to the same page shows cached results instantly
- "Loaded from cache" banner appears with option to re-run
- Cache expires after 7 days

#### Re-analysis
- Click "Re-run" to analyze the page again with fresh data
- Useful after making changes or for updated content
- Overwrites cached results

## Supported Page Types

The extension works on any industry and page type, including:

- **E-commerce Product Pages**: Optimizes for product purchases
- **SaaS Pricing Pages**: Focuses on account signups and trials
- **Lead Generation Pages**: Improves form completion rates
- **Service Landing Pages**: Enhances contact and inquiry generation
- **B2B Pages**: Optimizes for demo requests and consultations

## Primary Conversion Detection

The AI automatically infers the primary conversion goal:

- **Product Purchase**: E-commerce sites with buy/cart buttons
- **Lead Submit**: Contact forms and consultation requests
- **Account Signup**: Registration and trial signups
- **Primary CTA Click**: General call-to-action optimization

## Technical Details

### Architecture
- **Manifest V3**: Latest Chrome extension standard
- **TypeScript**: Type-safe development
- **Vite**: Fast build and development
- **Content Scripts**: DOM analysis and data extraction
- **Chrome Storage**: Local caching and settings
- **jsPDF**: Client-side PDF generation

### Page Analysis Process
1. **DOM Scraping**: Extracts page elements and content
2. **Signal Detection**: Identifies CTAs, forms, trust indicators, pricing
3. **Content Summarization**: Creates token-efficient summary
4. **AI Analysis**: Sends to OpenAI for expert recommendations
5. **Result Processing**: Validates and displays recommendations

### Privacy & Security
- **Local Storage**: All data stored locally in Chrome
- **No External Servers**: Direct API calls to OpenAI only
- **No Data Sharing**: Your API key and results stay private
- **Minimal Permissions**: Only required Chrome permissions

## Configuration Options

### Model Selection
- **GPT-4o Mini** (Recommended): Best cost/performance balance
- **GPT-4o**: Higher quality analysis, higher cost
- **GPT-4 Turbo**: Advanced analysis capabilities
- **GPT-3.5 Turbo**: Budget option with good results

### Cache Management
- View number of cached audits
- Clear all cache to free storage
- Automatic cleanup of old results (7+ days)

## Development

### Scripts
```bash
npm run dev    # Development server with hot reload
npm run build  # Production build
npm run preview # Preview built extension
```

### Project Structure
```
src/
├── content/           # Content scripts for page analysis
├── popup/            # Extension popup UI
├── options/          # Settings/options page
├── types/            # TypeScript type definitions
├── utils/            # Shared utilities (storage, LLM, PDF)
└── manifest.json     # Extension manifest
```

## API Costs

Typical costs per analysis with GPT-4o Mini:
- **Simple pages**: ~$0.001-0.003 per analysis
- **Complex pages**: ~$0.003-0.008 per analysis
- **Caching**: Reduces costs by avoiding re-analysis

## Troubleshooting

### Common Issues

**"API key not configured"**
- Go to Options and enter a valid OpenAI API key
- Ensure key starts with `sk-` and has proper permissions

**"Page has limited readable content"**
- Try a different page with more text content
- Some SPAs may need time to load content

**"LLM API error (401)"**
- Check API key validity
- Verify account has remaining credits
- Ensure API key has proper permissions

**"Analysis failed"**
- Check internet connection
- Try again in a few moments (rate limiting)
- Verify OpenAI service status

### Performance Tips

- Use caching when possible to save API costs
- Choose GPT-4o Mini for best cost/performance ratio
- Clear cache periodically if storage is a concern

## Browser Compatibility

- **Chrome 88+**: Full support
- **Chromium-based browsers**: Compatible (Edge, Brave, etc.)
- **Firefox**: Not supported (Chrome extension only)

## Contributing

This is a production-ready extension. For issues or feature requests:

1. Check existing issues first
2. Provide detailed reproduction steps
3. Include Chrome version and extension version
4. Test with different page types

## License

See LICENSE file for details.

## Disclaimer

This extension is advisory only and not an official Google product or endorsement. Recommendations are based on general best practices and may not apply to all business contexts. Always test changes in your specific environment.
