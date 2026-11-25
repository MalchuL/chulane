/** Keep the shell's themed picker independent of selects contributed by editor extensions. */
import type {ComponentProps} from 'react'
import {NativeSelect as Select} from '../../../vendor/rivto/packages/react-rivto-editor/src/components/ui/native-select'
import './liqui-controls.css'
export {NativeSelectOption} from '../../../vendor/rivto/packages/react-rivto-editor/src/components/ui/native-select'

/** Use the shared shadcn trigger and the platform's keyboard, form and touch semantics. */
export function NativeSelect(props:ComponentProps<typeof Select>){return <Select {...props} data-app-select=""/>}
