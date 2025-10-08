export interface PackagingBreakdown {
  totalUnits: number;
  fullPallets: number;
  remainingCases: number;
  looseUnits: number;
  totalCases: number;
  totalWeight: number;
  totalVolume: number;
  packagingDetails: {
    pallets: {
      count: number;
      casesPerPallet: number;
      unitsPerPallet: number;
    };
    partialPallet: {
      cases: number;
      units: number;
    };
    loose: {
      units: number;
    };
  };
}

export interface ProductSpecs {
  units_per_case: number;
  cases_per_pallet: number;
  weight_per_case: number;
  volume_per_case: number;
}

/**
 * Calculate packaging breakdown for a given quantity
 * Handles full pallets, partial pallets with remaining cases, and loose units
 */
export function calculatePackaging(
  quantity: number,
  specs: ProductSpecs
): PackagingBreakdown {
  const { units_per_case, cases_per_pallet, weight_per_case, volume_per_case } = specs;

  // Calculate total cases needed
  const totalCases = Math.ceil(quantity / units_per_case);
  
  // Calculate full pallets
  const fullPallets = Math.floor(totalCases / cases_per_pallet);
  
  // Calculate remaining cases after full pallets
  const remainingCases = totalCases - (fullPallets * cases_per_pallet);
  
  // Calculate loose units (units that don't fill a complete case)
  const unitsInCompleteCases = totalCases * units_per_case;
  const looseUnits = unitsInCompleteCases - quantity;
  
  // Calculate total weight and volume
  const totalWeight = totalCases * weight_per_case;
  const totalVolume = totalCases * volume_per_case;

  return {
    totalUnits: quantity,
    fullPallets,
    remainingCases,
    looseUnits,
    totalCases,
    totalWeight,
    totalVolume,
    packagingDetails: {
      pallets: {
        count: fullPallets,
        casesPerPallet: cases_per_pallet,
        unitsPerPallet: cases_per_pallet * units_per_case,
      },
      partialPallet: {
        cases: remainingCases,
        units: remainingCases * units_per_case,
      },
      loose: {
        units: looseUnits,
      },
    },
  };
}

/**
 * Format packaging breakdown into human-readable text
 */
export function formatPackagingBreakdown(breakdown: PackagingBreakdown): string {
  const parts: string[] = [];

  if (breakdown.fullPallets > 0) {
    parts.push(`${breakdown.fullPallets} full pallet${breakdown.fullPallets > 1 ? 's' : ''}`);
  }

  if (breakdown.remainingCases > 0) {
    parts.push(`${breakdown.remainingCases} case${breakdown.remainingCases > 1 ? 's' : ''}`);
  }

  if (breakdown.looseUnits > 0) {
    parts.push(`${breakdown.looseUnits} loose unit${breakdown.looseUnits > 1 ? 's' : ''}`);
  }

  return parts.join(' + ') || '0 units';
}

/**
 * Calculate optimal shipping configuration
 * Returns the most efficient way to pack the order
 */
export function getShippingConfiguration(
  quantity: number,
  specs: ProductSpecs
): string {
  const breakdown = calculatePackaging(quantity, specs);
  
  const config: string[] = [];
  
  if (breakdown.fullPallets > 0) {
    config.push(`${breakdown.fullPallets} × Full Pallet (${breakdown.packagingDetails.pallets.casesPerPallet} cases each)`);
  }
  
  if (breakdown.remainingCases > 0) {
    config.push(`${breakdown.remainingCases} × Case (${specs.units_per_case} units each)`);
  }
  
  if (breakdown.looseUnits > 0) {
    config.push(`Note: Last case will have ${breakdown.looseUnits} empty slots`);
  }
  
  return config.join('\n');
}
