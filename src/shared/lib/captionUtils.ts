/**
 * Utility functions for caption handling
 */

/**
 * Create a short, punchy Facebook caption from the full Instagram caption.
 * 
 * Facebook works better with shorter captions. This function:
 * 1. Extracts the opening hook/intro paragraph
 * 2. Adds a simple CTA
 * 3. Keeps it under maxLength characters
 * 
 * @param fullCaption - The full Instagram caption
 * @param maxLength - Maximum characters for FB caption (default 400)
 * @returns A condensed Facebook-optimized caption
 */
export function createFacebookCaption(fullCaption: string, maxLength: number = 400): string {
  if (!fullCaption || fullCaption.length <= maxLength) {
    return fullCaption
  }

  // Split by double newlines to get paragraphs
  const paragraphs = fullCaption.split('\n\n')

  // Get the first paragraph (usually the hook/intro)
  let firstPara = paragraphs[0]?.trim() || ''

  // If first paragraph is empty or too short, try to get more content
  if (firstPara.length < 50 && paragraphs.length > 1) {
    firstPara = paragraphs[0].trim() + '\n\n' + paragraphs[1].trim()
  }

  // Remove any emoji-starting lines from the first para (those are usually CTAs)
  const lines = firstPara.split('\n')
  const cleanLines: string[] = []
  
  // Emoji regex pattern for detecting lines that start with emojis
  const emojiStartPattern = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u

  for (const line of lines) {
    // Skip lines that start with emojis (CTA lines)
    if (line && !emojiStartPattern.test(line.trim())) {
      cleanLines.push(line)
    }
  }

  let introText = cleanLines.join('\n').trim()

  // Simple FB CTA
  const fbCta = '\n\n💡 Follow for daily health insights!'

  // Calculate available space for intro
  const availableSpace = maxLength - fbCta.length

  // Truncate intro if needed, but at a sentence boundary
  if (introText.length > availableSpace) {
    // Try to cut at a sentence boundary
    const truncated = introText.slice(0, availableSpace)

    // Find last sentence ending
    const lastPeriod = truncated.lastIndexOf('.')
    const lastQuestion = truncated.lastIndexOf('?')
    const lastExclaim = truncated.lastIndexOf('!')

    const cutPoint = Math.max(lastPeriod, lastQuestion, lastExclaim)

    if (cutPoint > availableSpace * 0.5) {
      // Only use sentence boundary if it's at least half the text
      introText = truncated.slice(0, cutPoint + 1)
    } else {
      // Cut at word boundary
      const lastSpace = truncated.lastIndexOf(' ')
      introText = truncated.slice(0, lastSpace) + '...'
    }
  }

  return introText + fbCta
}
