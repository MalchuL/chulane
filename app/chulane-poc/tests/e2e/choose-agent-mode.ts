/** Select a permission mode through the same composer menu used in the browser and desktop app. */
import type {Page} from '@playwright/test'

/** Open the mode button and choose a named permission level. */
export async function chooseAgentMode(page:Page,name:'Ask'|'Suggest'|'Append'|'Full'){
  await page.getByRole('button',{name:/^Agent permissions:/}).click()
  await page.getByRole('menuitemradio',{name,exact:true}).click()
}
