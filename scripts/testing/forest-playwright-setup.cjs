const { execFileSync } = require('node:child_process');
const path = require('node:path');
module.exports = async () => {
  const root=path.resolve(__dirname,'../..');
  execFileSync(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run',
    'scripts/testing/forest-legacy-fixture.test.ts','scripts/testing/forest-episode-fixture.test.ts','scripts/testing/forest-cistern-fixture.test.ts','scripts/testing/forest-wetland-fixture.test.ts','scripts/testing/forest-force-fixture.test.ts','scripts/testing/forest-water-study-fixture.test.ts','--maxWorkers=1','--reporter=dot'],
    {cwd:root,stdio:'inherit',windowsHide:true});
};
