/**
 * Site-specific selectors and interaction rules for Amazon.in and Flipkart.com.
 * Designed to be highly modular and support selector updates easily.
 */

export const PLATFORMS = {
  AMAZON: 'amazon',
  FLIPKART: 'flipkart',
  UNKNOWN: 'unknown',
};

/**
 * Extracts a unique product ID and platform type from a product URL.
 */
export function parseProductUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes('amazon.') || hostname === 'amzn.in' || hostname.includes('amzn.')) {
      // Amazon ASIN is a 10-character alphanumeric code
      // Match /dp/ASIN or /gp/product/ASIN or short link /d/ASIN
      const asinMatch = url.pathname.match(/\/(?:dp|gp\/product|d)\/([A-Z0-9]{10})/i);
      if (asinMatch && asinMatch[1]) {
        return {
          productId: asinMatch[1].toUpperCase(),
          platform: PLATFORMS.AMAZON,
        };
      }
    } else if (hostname.includes('flipkart.')) {
      // Flipkart product IDs are usually in query param `pid`
      const pid = url.searchParams.get('pid');
      if (pid) {
        return {
          productId: pid,
          platform: PLATFORMS.FLIPKART,
        };
      }
      // Fallback: match Flipkart product ID from pathname /p/itm... (16 chars)
      const pMatch = url.pathname.match(/\/p\/([a-zA-Z0-9]{16})/i);
      if (pMatch && pMatch[1]) {
        return {
          productId: pMatch[1],
          platform: PLATFORMS.FLIPKART,
        };
      }
    }

    // If we can't extract a product ID, hash the path to create a unique identifier
    const hash = Buffer.from(url.pathname + url.search).toString('base64').substring(0, 12);
    return {
      productId: `UNK_${hash}`,
      platform: PLATFORMS.UNKNOWN,
    };
  } catch (error) {
    throw new Error(`Invalid URL structure: ${error.message}`);
  }
}

export const selectors = {
  [PLATFORMS.AMAZON]: {
    // Selectors for changing location
    locationWidget: '#nav-global-location-slot, #glow-ingress-block, a#nav-global-location-popover-link',
    pincodeInput: 'input#GLUXZipUpdateInput',
    pincodeSubmit: '#GLUXZipUpdate input[type="submit"], #GLUXZipUpdate, input.a-button-input[aria-labelledby="GLUXZipUpdate-announce"]',
    doneButton: 'button[name="glowDoneButton"], .a-popover-footer #GLUXConfirmClose', // sometimes a done button is required to close modal

    // Selectors to verify location change worked
    locationTextContainer: '#glow-ingress-line2, #nav-global-location-slot',

    // Selectors for parsing availability status
    availabilityContainer: '#availability, #ddmDeliveryMessage, #deliveryBlockMessage, #outOfStock',
    outOfStockKeywords: [
      'currently unavailable',
      'out of stock',
      'we don\'t know when or if',
      'cannot be delivered to this location',
      'not deliverable',
      'does not deliver to'
    ],
    deliveryDateContainer: '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE, #ddmDeliveryMessage, #fast-track-message, #upsell-message, #deliveryBlockMessage',
  },

  [PLATFORMS.FLIPKART]: {
    // Selectors for changing location
    locationWidget: 'input#pincodeInputId',
    pincodeInput: 'input#pincodeInputId',
    pincodeSubmit: 'span._2PciBh, span.y305Xq, div._3X230a, ._2PciBh', // "Check" button

    // Selectors to verify location change worked
    locationTextContainer: 'input#pincodeInputId',

    // Selectors for parsing availability status
    deliveryContainer: 'div._3X230a, div._1TP2go, div.NY1eFD, div._3wU53n, div._2NjOI7, ._1p374S', 
    outOfStockKeywords: [
      'not deliverable',
      'out of stock',
      'currently unavailable',
      'not available',
      'no seller delivering'
    ],
    deliveryDateContainer: 'div._3X230a, div.NY1eFD, ._1p374S',
  }
};
