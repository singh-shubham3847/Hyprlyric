import type { StyleId } from '@shared/types'
import { createFisheye } from './fisheye'
import { createShip } from './ship'
import type { StageStyle } from './types'
import { createVisual } from './visual'

export function createStyle(id: StyleId): StageStyle {
  switch (id) {
    case 'tesseract':
    case 'ship':
      return createShip(false)
    case 'tesseract-visual':
      return createShip(true)
    case 'fisheye':
      return createFisheye(false)
    case 'fisheye-visual':
      return createFisheye(true)
    case 'visual':
      return createVisual()
  }
}
