import React from 'react';
import { BookingFlowScreen } from '@/screens/booking/BookingFlowScreen';

export default function BookingFlow() {
  return <BookingFlowScreen />;
}
eight: FONTS.weights.bold,
    color: COLORS.primary,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalContainer: {
    flex: 1,
  },
  continueButton: {
    flex: 2,
    marginLeft: SPACING.md,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
