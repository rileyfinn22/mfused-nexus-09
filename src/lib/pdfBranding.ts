import jsPDF from 'jspdf';

// Company branding constants
export const VIBE_COMPANY = {
  name: 'Vibe Packaging',
  address: {
    street: '1415 S 700 W, Ste FLEXETC',
    city: 'Salt Lake City',
    state: 'UT',
    zip: '84104'
  },
  logoPath: '/images/vibe-logo.png'
};

/**
 * Adds Vibe Packaging branding header to a PDF document
 * @param doc - jsPDF document instance
 * @param options - Optional configuration
 * @returns The Y position after the header
 */
export async function addPdfBranding(
  doc: jsPDF, 
  options: { 
    showAddress?: boolean;
    documentTitle?: string;
    titleAlign?: 'left' | 'center' | 'right';
  } = {}
): Promise<number> {
  const { showAddress = true, documentTitle, titleAlign = 'center' } = options;
  const pageWidth = doc.internal.pageSize.getWidth();
  
  let yPos = 15;
  
  // Try to add logo
  try {
    const logoImg = await loadImage(VIBE_COMPANY.logoPath);
    // Logo dimensions - maintain aspect ratio
    const logoWidth = 45;
    const logoHeight = 30;
    doc.addImage(logoImg, 'PNG', 14, yPos - 5, logoWidth, logoHeight);
  } catch (error) {
    // Fallback to text if logo fails to load
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(76, 175, 80); // Green color
    doc.text('Vibe Packaging', 14, yPos + 10);
  }
  
  // Add company address on the right side
  if (showAddress) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(VIBE_COMPANY.address.street, pageWidth - 14, yPos, { align: 'right' });
    doc.text(
      `${VIBE_COMPANY.address.city}, ${VIBE_COMPANY.address.state} ${VIBE_COMPANY.address.zip}`,
      pageWidth - 14,
      yPos + 5,
      { align: 'right' }
    );
  }
  
  // Add document title if provided
  if (documentTitle) {
    yPos += 25;
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    
    let titleX = pageWidth / 2;
    if (titleAlign === 'left') titleX = 14;
    if (titleAlign === 'right') titleX = pageWidth - 14;
    
    doc.text(documentTitle, titleX, yPos, { align: titleAlign });
    yPos += 10;
  } else {
    yPos += 30;
  }
  
  // Reset text color
  doc.setTextColor(0, 0, 0);
  
  return yPos;
}

/**
 * Adds a branded footer to a PDF document
 * @param doc - jsPDF document instance
 */
export function addPdfFooter(doc: jsPDF): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(128, 128, 128);
  doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 15, { align: 'center' });
  doc.text(
    `${VIBE_COMPANY.name} | ${VIBE_COMPANY.address.street}, ${VIBE_COMPANY.address.city}, ${VIBE_COMPANY.address.state} ${VIBE_COMPANY.address.zip}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  );
}

/**
 * Loads an image from a URL and returns a data URL
 */
async function loadImage(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Synchronous version that adds branding without the logo image
 * Use this for cases where async is not suitable
 */
export function addPdfBrandingSync(
  doc: jsPDF, 
  options: { 
    showAddress?: boolean;
    documentTitle?: string;
    titleAlign?: 'left' | 'center' | 'right';
  } = {}
): number {
  const { showAddress = true, documentTitle, titleAlign = 'center' } = options;
  const pageWidth = doc.internal.pageSize.getWidth();
  
  let yPos = 15;
  
  // Text-based logo
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(76, 175, 80); // Green color matching logo
  doc.text('Vibe Packaging', 14, yPos + 5);
  
  // Add company address on the right side
  if (showAddress) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(VIBE_COMPANY.address.street, pageWidth - 14, yPos, { align: 'right' });
    doc.text(
      `${VIBE_COMPANY.address.city}, ${VIBE_COMPANY.address.state} ${VIBE_COMPANY.address.zip}`,
      pageWidth - 14,
      yPos + 5,
      { align: 'right' }
    );
  }
  
  // Add document title if provided
  if (documentTitle) {
    yPos += 20;
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    
    let titleX = pageWidth / 2;
    if (titleAlign === 'left') titleX = 14;
    if (titleAlign === 'right') titleX = pageWidth - 14;
    
    doc.text(documentTitle, titleX, yPos, { align: titleAlign });
    yPos += 10;
  } else {
    yPos += 25;
  }
  
  // Reset text color
  doc.setTextColor(0, 0, 0);
  
  return yPos;
}
