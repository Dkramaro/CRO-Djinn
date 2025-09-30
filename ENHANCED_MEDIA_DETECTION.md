# Enhanced Media & Interactive Element Detection

## Overview
We've added minimal but high-value data collection to capture carousel/slider detection, video elements, animated GIFs, and section relationships. This provides the LLM with critical contextual information while adding only ~1,000 tokens per page (vs the 10,000+ from keeping full CSS/metadata).

## What Was Added

### 1. **Enhanced Image Detection**
- **Added Fields:**
  - `isAnimated`: Boolean flag detecting GIFs and animated images
  - `parentSection`: String identifying which section the image belongs to
  
- **Detection Logic:**
  - Checks for `.gif` file extensions
  - Checks for `giphy` in URLs
  - Checks for animation-related class names
  
- **Example Output:**
  ```typescript
  {
    src: "https://example.com/hero.gif",
    alt: "Product demo",
    isAnimated: true,
    parentSection: "Section 1: Hero Banner"
  }
  ```

### 2. **Video Detection** (ENHANCED)
- **What's Detected:**
  - Native `<video>` elements
  - YouTube embeds
  - Vimeo embeds
  - Wistia embeds
  - Loom embeds
  
- **Fields Captured:**
  - `type`: video or iframe
  - `src`: Video URL
  - `autoplay`: Boolean flag
  - `muted`: Boolean flag
  - `controls`: Boolean flag (native videos only, iframes assumed true)
  - `loop`: Boolean flag
  - `poster`: Poster image URL (native videos only)
  - `width`: Video width in pixels
  - `height`: Video height in pixels
  - `parentSection`: Which section contains this video
  
- **Example Output:**
  ```typescript
  {
    type: "video",
    src: "https://example.com/demo.mp4",
    autoplay: false,
    muted: true,
    controls: true,
    loop: false,
    poster: "https://example.com/poster.jpg",
    width: 1200,
    height: 675,
    parentSection: "Section 3: How It Works"
  }
  ```

### 3. **Carousel/Slider Detection** (NEW)
- **What's Detected:**
  - Popular carousel libraries (Swiper, Slick, Glide, Splide)
  - Generic carousel/slider patterns
  - Custom implementations with slide/item classes
  
- **Fields Captured:**
  - `type`: carousel
  - `itemCount`: Number of slides/items
  - `hasControls`: Has prev/next buttons
  - `hasDots`: Has pagination dots
  - `parentSection`: Which section contains this carousel
  
- **Example Output:**
  ```typescript
  {
    type: "carousel",
    itemCount: 8,
    hasControls: true,
    hasDots: true,
    parentSection: "Section 2: Customer Reviews"
  }
  ```

### 4. **Section Identification Helper**
- **Purpose:** Creates human-readable section identifiers
- **Logic:**
  - Finds closest parent section/article/main
  - Gets section index
  - Extracts heading text (first 30 chars)
  - Returns: "Section 1: Customer Reviews" or "Section 2"

## Changes Made

### Files Modified

#### 1. `src/content/scraper.ts`
- Added `getVideos()` method
- Added `getInteractiveElements()` method  
- Added `getParentSectionIdentifier()` helper method
- Enhanced `getImages()` with `isAnimated` and `parentSection`
- Updated `extractStructuredContent()` to include videos and interactive elements

#### 2. `src/types/index.ts`
- Added `videos: any[]` to `RawPageData.structuredContent`
- Added `interactive: any[]` to `RawPageData.structuredContent`

#### 3. `src/offscreen/offscreen.ts`
- Added **MEDIA ELEMENTS** section to LLM prompt showing:
  - Videos with platform (YouTube/Vimeo/etc) and parent section
  - Animated images (GIFs) with parent sections
  
- Added **INTERACTIVE ELEMENTS** section showing:
  - Carousels with item counts, controls, and parent section
  
- Updated `cleanFilteredStructuredContent()` to pass through videos and interactive

## LLM Prompt Enhancement

The LLM now receives detailed information like:

```
MEDIA ELEMENTS:
IFRAME: YouTube (autoplay, has-controls) - 1920x1080px - Section 1: Hero Banner
VIDEO: Native Video (muted, has-controls) - 1200x675px - Section 3: Product Demo
Animated Images (GIFs): Section 1: Hero Banner, Section 4: Features

INTERACTIVE ELEMENTS:
CAROUSEL: 8 items (Has navigation) (Has dots) - Section 2: Customer Reviews
CAROUSEL: 5 items (Has navigation) - Section 6: Testimonials
```

### Visual Analysis Context

The prompt now includes important context for analyzing interactive elements in screenshots:

```
IMPORTANT: When analyzing videos, carousels, and interactive elements:
- Native video players may show a poster frame or first frame - this does NOT mean they're broken
- Videos with visible controls or play buttons are functional
- Carousels may appear static in screenshots but are functional if navigation controls are present
- Animated GIFs may appear as static images in screenshots but are functional on the live page
```

## Token Cost Analysis

- **Images**: ~10 extra tokens per image (isAnimated + parentSection)
  - 50 images × 10 tokens = **500 tokens**
  
- **Videos**: ~80 tokens per video (enhanced with size, controls, muted, loop info)
  - 5 videos × 80 tokens = **400 tokens**
  
- **Carousels**: ~80 tokens per carousel
  - 3 carousels × 80 tokens = **240 tokens**

- **Visual Analysis Context**: ~100 tokens (one-time addition to prompt)

**Total Added: ~1,240 tokens** vs **10,000+ tokens** from keeping CSS/metadata

## Benefits

### What the LLM Can Now Detect:

1. **Carousel-Specific Issues**
   - "The 8-slide testimonial carousel in Section 2 may reduce conversion - users rarely see beyond slide 2-3. Consider showing 3-4 testimonials statically instead."

2. **Video Context**
   - "The 1920x1080px autoplay video in the hero section may distract from the CTA. The video has controls enabled, allowing users to pause, but the autoplay behavior may create distraction before users can engage. Consider removing autoplay or moving video to Section 3: How It Works."

3. **GIF Awareness**
   - "Animated GIF in hero banner may slow page load and distract from value proposition."

4. **Section-Specific Recommendations**
   - "Section 2: Customer Reviews contains a carousel with 12 items but no navigation controls - users can't browse testimonials effectively."

## Real-World Example

**Before:**
```
LLM: "Consider adding social proof"
```

**After:**
```
LLM: "The carousel in Section 2: Customer Reviews has 8 testimonials but users 
typically only see 1-2. Convert this to a static grid showing 3-4 testimonials 
above the fold for immediate trust building."
```

### Prompt Structure Improvements

The analysis structure has been optimized to place **Visual CRO Analysis before Actionable Recommendations**:

1. Context Analysis (Business/Page/Purchase Type)
2. Page Summary (Strengths/Weaknesses/Journey)
3. **Visual CRO Analysis** (Visual issues inform recommendations)
4. Actionable Recommendations (Now informed by visual insights)
5. Quick Wins
6. Executive Summary
7. Copy Suggestions

This ensures visual insights directly inform the priority recommendations, creating more coherent and actionable analysis.

## Backward Compatibility

- ✅ All existing data still collected
- ✅ No breaking changes to types
- ✅ Gracefully handles pages without videos/carousels
- ✅ All fields optional - no errors if missing

## Testing Recommendations

Test on pages with:
1. ✅ YouTube/Vimeo embeds
2. ✅ Product carousels
3. ✅ Animated GIFs
4. ✅ Testimonial sliders
5. ✅ Multiple videos per page
6. ✅ Pages with none of these elements

## Future Enhancements (Optional)

If needed, could add:
- Background video detection (`<div style="background-image: url(video.mp4)"`)
- Parallax effect detection
- Lazy-loaded content detection
- Infinite scroll detection

## Recent Updates (Latest)

### Enhanced Video Metadata (v2)
- Added `muted`, `controls`, `loop`, and `poster` attributes
- Added `width` and `height` dimensions
- Enhanced prompt formatting to show: `VIDEO: Native Video (muted, has-controls) - 1200x675px - Section 2`
- Prevents LLM from incorrectly identifying functional videos as "broken" or "static"

### Visual Analysis Context
- Added explicit guidance about interactive elements in screenshots
- Clarifies that static screenshots don't mean broken functionality
- Reduces false positives about "broken" videos, carousels, or GIFs

### Prompt Structure Optimization
- Moved Visual CRO Analysis before Actionable Recommendations
- Visual insights now directly inform priority recommendations
- Creates more coherent and actionable analysis flow

## Conclusion

This minimal enhancement provides **maximum context** with **minimal token cost** (~1,240 tokens), enabling the LLM to give more specific, actionable recommendations about carousel usage, video placement, and media-related conversion issues while avoiding false positives about "broken" interactive elements.
