export const CARRIERS = [
  { value: 'msc', label: 'MSC' },
  { value: 'maersk', label: 'Maersk' },
  { value: 'cma_cgm', label: 'CMA CGM' },
  { value: 'cosco', label: 'COSCO' },
  { value: 'evergreen', label: 'Evergreen' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'ups', label: 'UPS' },
  { value: 'usps', label: 'USPS' },
  { value: 'dhl', label: 'DHL' },
  { value: 'fedex_freight', label: 'FedEx Freight' },
  { value: 'other', label: 'Other' },
];

export function getTrackingUrl(carrier: string, trackingNumber: string): string {
  if (!trackingNumber) return '';
  const num = encodeURIComponent(trackingNumber.trim());
  const c = carrier.toLowerCase().replace(/\s+/g, '_');

  switch (c) {
    case 'ups':
      return `https://www.ups.com/track?tracknum=${num}`;
    case 'fedex':
    case 'fedex_freight':
      return `https://www.fedex.com/fedextrack/?trknbr=${num}`;
    case 'usps':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${num}`;
    case 'dhl':
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${num}`;
    case 'msc':
      return `https://www.msc.com/en/track-a-shipment?trackingNumber=${num}`;
    case 'maersk':
      return `https://www.maersk.com/tracking/${num}`;
    case 'cma_cgm':
      return `https://www.cma-cgm.com/ebusiness/tracking/search?SearchId=${num}`;
    default:
      return `https://www.google.com/search?q=${num}+tracking`;
  }
}

export const LEG_TYPE_LABELS: Record<string, string> = {
  international: 'International Freight',
  customs: 'Customs Clearance',
  domestic: 'Domestic Delivery',
};

export const LEG_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'customs_hold', label: 'Customs Hold' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
];

export function getLegStatusColor(status: string) {
  switch (status) {
    case 'delivered':
    case 'cleared':
      return 'bg-green-500/10 text-green-600 border-green-500/30';
    case 'in_transit':
    case 'out_for_delivery':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
    case 'customs_hold':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}
