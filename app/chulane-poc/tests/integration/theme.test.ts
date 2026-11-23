/** Exercise the device settings contract shared by localStorage and Electron's SQLite adapter. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {activeTheme,hallmarkThemes,themeSchema} from '../../src/shared/theme.ts'

test('legacy palettes become personal themes and survive a saved Hallmark preset',()=>{
  const legacy={application:{background:'#faf6ec',text:'#291c12',font:'serif',size:18},
    editor:{background:'#fffefd',text:'#292929',font:'mono',size:20},accent:'#145623'}
  const personal=themeSchema.parse(legacy)
  assert.equal(personal.preset,'custom')
  assert.equal(personal.material,'auto')
  assert.equal(themeSchema.parse({...personal,material:'solid'}).material,'solid')
  assert.deepEqual(personal.editor,legacy.editor)
  const saved=themeSchema.parse(JSON.parse(JSON.stringify({...personal,preset:'terminal'})))
  assert.deepEqual(activeTheme(saved),hallmarkThemes.terminal)
  assert.deepEqual(activeTheme({...saved,preset:'custom'}),personal)
  assert.equal(activeTheme({...saved,preset:'chulane'}),null)
  assert.equal(themeSchema.safeParse({...saved,radius:-5}).success,false)
})
