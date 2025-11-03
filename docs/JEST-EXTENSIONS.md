# Jest Extensions for VS Code/Cursor

These extensions provide a better UI and workflow for running Jest tests.

## Recommended: Jest Extension

**Extension:** Jest  
**Publisher:** Orta (Jest Community)  
**Extension ID:** `orta.vscode-jest`

### Features:
- ✅ **Test Explorer Integration** - Hierarchical view of all tests in sidebar
- ✅ **Inline Test Results** - See pass/fail status next to each test in code
- ✅ **Run Tests from UI** - Click to run individual tests or suites
- ✅ **Code Coverage Visualization** - See which lines are covered
- ✅ **Auto-run on Save** - Automatically runs tests when you save files
- ✅ **Watch Mode** - Continuously watches and runs tests
- ✅ **Debug Support** - Set breakpoints and debug tests
- ✅ **Snapshot Management** - Manage Jest snapshots

### Installation:
1. Press `Cmd+Shift+X` (Mac) or `Ctrl+Shift+X` (Windows/Linux)
2. Search for **"Jest"** by Orta
3. Click **Install**

### Usage:
- Tests appear in the **Test Explorer** sidebar (beaker icon)
- Click ▶️ next to any test to run it
- See ✅ (pass) or ❌ (fail) indicators in the editor
- Click on failed tests to see error details

## Alternative: Jest Runner

**Extension:** Jest Runner  
**Publisher:** firsttris  
**Extension ID:** `firsttris.vscode-jest-runner`

### Features:
- Run individual tests via CodeLens (inline buttons)
- Run tests from context menu
- Less UI, more command-based

## Premium Option: Wallaby.js

**Extension:** Wallaby.js  
**Publisher:** Wallaby.js  
**Extension ID:** `wallabyjs.wallaby-vscode`

### Features:
- **Real-time feedback** as you type (no saving needed)
- **Code coverage** highlighted directly in editor
- **Value explorer** shows runtime values
- **Time travel debugger**

**Note:** Wallaby.js requires a license (paid) for most features, but has a free tier.

## Setup for This Project

The **Jest Extension** by Orta works out of the box with your current setup:

1. **Install the extension** (see above)
2. **Reload VS Code/Cursor**
3. **Open the Test Explorer** (beaker icon in sidebar)
4. **Tests will auto-discover** from `api-tests/__tests__/api.test.ts`

The extension will automatically:
- Detect your `jest.config.js`
- Run tests in watch mode
- Show results in the sidebar
- Display inline pass/fail indicators

## Configuration (Optional)

You can configure the extension via `.vscode/settings.json`:

```json
{
  "jest.autoRun": "watch",
  "jest.showCoverageOnLoad": false,
  "jest.rootPath": ".",
  "jest.jestCommandLine": "npm test --"
}
```

## Benefits Over Terminal

- **Visual test tree** - See all tests organized by file/describe blocks
- **Click to run** - No need to type commands
- **Inline indicators** - See pass/fail right in your code
- **Better error display** - Click errors to jump to code
- **Coverage visualization** - See covered/uncovered lines
- **Integrated debugging** - Set breakpoints and debug


