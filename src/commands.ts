import * as vscode from 'vscode'
import { Dependencies, DependencyTreeProvider, Dependency, WorkspaceItem } from './dependencies'
import * as childProcess from 'child_process'
import { Writable } from 'stream'
import * as fs from 'fs'
import * as path from 'path'
import console from './console'
import utils from './utils'

function isDependency(node: any): node is Dependency {
	return node instanceof Dependency
}

export default class Commands {
	constructor(private dependencies: Dependencies, private treeDataProvider: DependencyTreeProvider, private treeView: vscode.TreeView<Dependency | WorkspaceItem>) { }

	private async _install(workspacePath: string, status: string, ..._deps: ({ rawSep: string, dev: boolean } | { rawSep: string, dev: boolean }[])[]) {
		if (!fs.existsSync(path.join(workspacePath, 'package.json')))
			await vscode.window.showInformationMessage('No package.json was found. Do you want to force initialize?', 'Yes', 'No').then(value => {
				if (value === 'Yes')
					this._init(workspacePath)
			})

		const deps: { rawSep: string, dev: boolean }[] = _deps.flat()

		if (deps.flat().length === 0) return

		for (const dep of deps) {
			const moduleName = this._getModuleName(dep.rawSep)
			this.dependencies.setStatus(workspacePath, moduleName, status, dep.dev)
		}

		const _catch = (err: any) => {
			vscode.window.showErrorMessage(`Installation of module${savePackages.length !== 1 ? 's' : ''} ${savePackages.join(', ')} did not finish successfully.\n${err}`)
		}

		const _finally = (deps: { rawSep: string, dev: boolean }[]) => () => {
			for (const dep of deps)
				this.dependencies.removeStatus(workspacePath, this._getModuleName(dep.rawSep))
		}

		const saveDeps = deps.filter(dep => !dep.dev)
		const savePackages = saveDeps.map(dep => dep.rawSep)
		let saveInstallation: Promise<void> = Promise.resolve()
		if (saveDeps.length > 0)
			saveInstallation = this._executeCommand(`npm install ${savePackages.join(' ')} --save`, { cwd: workspacePath })
				.catch(_catch)
				.finally(_finally(saveDeps))

		const devDeps = deps.filter(dep => dep.dev)
		const devPackages = devDeps.map(dep => dep.rawSep)
		let devInstallation: Promise<void> = Promise.resolve()
		if (devDeps.length > 0)
			devInstallation = this._executeCommand(`npm install ${devPackages.join(' ')} --save-dev`, { cwd: workspacePath })
				.catch(_catch)
				.finally(_finally(devDeps))

		await saveInstallation.then(() => this.treeDataProvider.refresh())
		await devInstallation.then(() => this.treeDataProvider.refresh())
	}

	async changeDependencyType(_dependency?: Dependency) {
		const selection = this.treeView.selection.filter(isDependency)
		const dependencies = selection.length > 0 ? selection : _dependency ? [_dependency] : []

		const devPick = await vscode.window.showQuickPick(['$(package) dependency', '$(tools) dev dependency'], { placeHolder: `Choose type of dependency.` })
		if (!devPick) return

		const dev = devPick.indexOf('dev dependency') !== -1

		return Promise.all(dependencies.map((dependency) => {
			if (dependency.versions.length !== 1) return Promise.resolve()
			return this._install(dependency.workspace.path, 'updating...', { dev, rawSep: `${dependency.name}@${dependency.versions[0]}` })
		}))
	}

	async changeDependencyVersion(_dependency?: Dependency) {
		const selection = this.treeView.selection.filter(isDependency)
		const dependencies = selection.length > 0 ? selection : _dependency ? [_dependency] : []

		const version = await vscode.window.showInputBox({ placeHolder: `Type new version of dependency.` })
		if (!version) return

		return Promise.all(dependencies.map((dependency) => {
			if (dependency.versions.length !== 1) return Promise.resolve()
			return this._install(dependency.workspace.path, 'updating...', { dev: dependency.dev, rawSep: `${dependency.name}@${version}` })
		}))
	}

	opennpm(dependency: Dependency) {
		const _package = dependency.name
		const version = dependency.versions.length === 1 ? dependency.versions[0] : undefined

		let url = `https://www.npmjs.com/package/${_package}`

		if (version) {
			const match = /([0-9]+\.[0-9]+\.[0-9]+)/.exec(version)

			const _version = match && typeof match[0] === 'string' ? match[0] : undefined

			if (_version)
				url += `/v/${_version}`
		}

		vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url))
	}

	private async _executeCommand(command: string, options?: childProcess.ExecOptions & { pipe?: boolean | Writable }): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const subprocess = childProcess.exec(command, options)

			subprocess.on('error', reject)
			subprocess.on('exit', code => {
				if (code !== 0)
					reject(code)

				this.treeDataProvider.refresh()
				resolve()
			})

			if (options?.pipe !== false) {
				const pipe = options?.pipe instanceof Writable ? options.pipe : console.pipe

				subprocess.stdout?.pipe(pipe)
				subprocess.stderr?.pipe(pipe)
			}
		})
	}

	async addDependency(_workspace?: WorkspaceItem) {
		const workspace = _workspace?.path ?? await this._getWorkspace()
		if (!workspace && !_workspace) return void vscode.window.showWarningMessage('No workspace or folder open')
		const deps = await this._getModuleNames(false)
		if (!(deps && deps.length)) return
		this._installAutofill(workspace, undefined, deps)
	}

	async addDevDependency(_workspace?: WorkspaceItem) {
		const workspace = _workspace?.path ?? await this._getWorkspace()
		if (!workspace && !_workspace) return void vscode.window.showWarningMessage('No workspace or folder open')
		const deps = await this._getModuleNames(true)
		if (!(deps && deps.length)) return
		this._installAutofill(workspace, undefined, deps)
	}

	private async _getWorkspace() {
		let workspace: string

		if (!utils.workspaces.length) return

		if (utils.workspaces.length === 1)
			workspace = utils.workspaces[0]
		else {
			const _workspace = (await vscode.window.showWorkspaceFolderPick())?.uri.path.replace(/\/[a-zA-Z]:\//, '/')
			if (!_workspace) return

			workspace = _workspace
		}

		return workspace
	}

	private async _init(workspacePath: string) {
		return void await this._executeCommand('npm init -y', { cwd: workspacePath }).catch(() => vscode.window.showErrorMessage(`Initialization of project failed.`))
	}

	private async _getModuleNames(dev: boolean, value?: string) {
		return (await vscode.window.showInputBox({ value, valueSelection: [999, 999], placeHolder: 'package @packages/package version@1.2.3', prompt: 'Enter package name(s) space separated with or without version.' }))?.split(' ').map(rawSep => ({ rawSep, dev }))
	}

	private _getModuleName(_package: string): string {
		return _package.replace(/@[^/]+$/, '').trim()
	}

	private async _installAutofill(_workspace?: string, _status?: string, ..._deps: ({ rawSep: string, dev: boolean } | { rawSep: string, dev: boolean }[])[]) {
		if (_deps.flat().length === 0) return

		const workspace = _workspace ?? await this._getWorkspace()
		if (!workspace) return

		const deps = _deps.flat()
		const status = _status ?? 'installing...'

		this._install(workspace, status, deps)
	}

	async remove(_dependency?: Dependency) {
		const selection = this.treeView.selection.filter(isDependency)
		const dependencies = selection.length > 0 ? selection : _dependency ? [_dependency] : []

		for (const dependency of dependencies) {
			this.dependencies.setStatus(dependency.workspace.path, dependency.name, 'removing...')

			this._executeCommand(`npm remove ${dependency.name}`, { cwd: dependency.workspace.path })
				.catch(() => vscode.window.showErrorMessage(`Uninstallation of module ${dependency.name} did not finish successfully.`))
				.finally(() => {
					this.dependencies.removeStatus(dependency.workspace.path, dependency.name)
					this.treeDataProvider.refresh()
				})
		}

		this.treeDataProvider.refresh()
	}

	async update(_dependency?: Dependency) {
		const selection = this.treeView.selection.filter(isDependency)
		const dependencies = selection.length > 0 ? selection : _dependency ? [_dependency] : []

		this.treeDataProvider.refresh()

		for (const dependency of dependencies)
			this._install(dependency.workspace.path, 'updating...', { dev: dependency.dev, rawSep: `${dependency.name}@latest` })
	}

	private _exclude(on: boolean) {
		const config = vscode.workspace.getConfiguration('files')

		const exclude = config.get<Record<string, boolean | { when: string }>>('exclude')

		if (!exclude) return

		exclude['**/node_modules'] = on
		exclude['**/package-lock.json'] = on

		config.update('exclude', exclude, vscode.ConfigurationTarget.Global)
	}

	public hideConfigFiles() {
		this._exclude(true)
	}

	public showConfigFiles() {
		this._exclude(false)
	}
}