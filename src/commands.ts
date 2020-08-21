import * as vscode from 'vscode';
import { Dependencies, DependencyTreeProvider, Dependency, WorkspaceItem } from './dependencies';
import * as childProcess from 'child_process';
import { Writable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import console from './console';
import utils from './utils';

function isDependency(node: any): node is Dependency {
	return node instanceof Dependency;
}

export default class Commands {
	constructor(private dependencies: Dependencies, private treeDataProvider: DependencyTreeProvider, private treeView: vscode.TreeView<Dependency | WorkspaceItem>) { }

	private async _install(workspace: string, status: string, ..._deps: ({ rawSep: string, dev: boolean } | { rawSep: string, dev: boolean }[])[]) {
		await this._initAutofill(workspace);

		const deps = _deps.flat();

		if (deps.flat().length === 0) return;

		for (const dep of deps) {
			const moduleName = this._getModuleName(dep.rawSep);
			this.dependencies.setStatus(workspace, moduleName, status, dep.dev);
		}

		for (const dep of deps) {
			await this._executeCommand(`npm install ${dep.rawSep}${typeof dep.dev === 'boolean' ? dep.dev ? ' --save-dev' : ' --save' : ''}`, { cwd: workspace })
				.catch(() => vscode.window.showErrorMessage(`Installation of module ${dep.rawSep} did not finish successfully.`));

			this.dependencies.removeStatus(workspace, this._getModuleName(dep.rawSep));
			this.treeDataProvider.refresh();
		}
	}

	async changeDependencyType(_node?: Dependency) {
		const node = _node ?? this.treeView.selection.length <= 1 ? this.treeView.selection.find(isDependency) : undefined;
		if (!node) return;
		if (node.versions.length !== 1) return void vscode.window.showInformationMessage('Node Dependencies does not support this kind of dependency yet.');

		const devPick = await vscode.window.showQuickPick(['dependency', 'dev dependency'], { placeHolder: `Choose type of dependency.` });

		if (!devPick) return;

		const dev = devPick === 'dev dependency';

		this.treeDataProvider.refresh(true);
		
		this._install(node.workspace.path, 'Updating...', { dev, rawSep: `${node.name}@${node.versions}` });
	}

	async changeDependencyVersion(_node?: Dependency) {
		const node = _node ?? this.treeView.selection.length <= 1 ? this.treeView.selection.find(isDependency) : undefined;
		if (!node) return;
		if (node.versions.length !== 1) return void vscode.window.showInformationMessage('Node Dependencies does not support this kind of dependency yet.');

		const version = await vscode.window.showInputBox({ placeHolder: `Type new version of dependency.` });
		if (!version) return;

		this.treeDataProvider.refresh(true);

		this._install(node.workspace.path, 'Updating...', { dev: node.dev, rawSep: `${node.name}@${version}` });
	}

	opennpm(_package: string, version?: string) {
		let url = `https://www.npmjs.com/package/${_package}`;

		if (version) {
			const match = /([0-9]+\.[0-9]+\.[0-9]+)/.exec(version);

			const _version = match && typeof match[0] === 'string' ? match[0] : undefined;

			if (_version)
				url += `/v/${_version}`;
		}

		vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
	}

	private async _executeCommand(command: string, options?: childProcess.ExecOptions & { pipe?: boolean | Writable }): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const subprocess = childProcess.exec(command, options);

			subprocess.on('error', reject);
			subprocess.on('exit', code => {
				if (code !== 0)
					reject(code);

				this.treeDataProvider.refresh();
				resolve();
			});

			if (options?.pipe !== false) {
				const pipe = options?.pipe instanceof Writable ? options.pipe : console.pipe;

				subprocess.stdout?.pipe(pipe);
				subprocess.stderr?.pipe(pipe);
			}
		});
	}

	async addDependency(_workspace?: WorkspaceItem) {
		const workspace = _workspace?.name ?? await this._getWorkspace();
		if (!workspace && !_workspace) return void vscode.window.showWarningMessage('No workspace or folder open');
		const deps = await this._getModuleNames(false);
		if (!(deps && deps.length)) return;
		this.treeDataProvider.refresh(true);
		this._installAutofill(workspace, undefined, deps);
	}

	async addDevDependency(_workspace?: WorkspaceItem) {
		const workspace = _workspace?.name ?? await this._getWorkspace();
		if (!workspace && !_workspace) return void vscode.window.showWarningMessage('No workspace or folder open');
		const deps = await this._getModuleNames(true);
		if (!(deps && deps.length)) return;
		this.treeDataProvider.refresh(true);
		this._installAutofill(workspace, undefined, deps);
	}

	private async _getWorkspace() {
		let workspace: string;

		if (!utils.workspaces.length) return;

		if (utils.workspaces.length === 1)
			workspace = utils.workspaces[0];
		else {
			const _workspace = (await vscode.window.showWorkspaceFolderPick())?.uri.path.replace(/\/[a-zA-Z]:\//, '/');

			if (!_workspace) return;

			workspace = _workspace;
		}

		return workspace;
	}

	private async _init(workspace: string) {
		return void await this._executeCommand('npm init -y', { cwd: workspace }).catch(() => vscode.window.showErrorMessage(`Initialization of project failed.`));
	}

	private async _initAutofill(_workspace?: string, force = false) {
		const workspace = _workspace ?? await this._getWorkspace();
		if (!workspace) return;

		if (!force && fs.existsSync(path.join(workspace, 'package.json')))
			return;

		return void await this._init(workspace);
	}

	private async _getModuleNames(dev: boolean, value?: string) {
		return (await vscode.window.showInputBox({ value, valueSelection: [999, 999], placeHolder: 'package @packages/package version@1.2.3', prompt: 'Enter package name(s) space separated with or without version.' }))?.split(' ').map(rawSep => ({ rawSep, dev }));
	}

	private _getModuleName(_package: string): string {
		return _package.replace(/@[^/]+$/, '').trim();
	}

	private async _installAutofill(_workspace?: string, _status?: string, ..._deps: ({ rawSep: string, dev: boolean } | { rawSep: string, dev: boolean }[])[]) {
		if (_deps.flat().length === 0) return;

		const workspace = _workspace ?? await this._getWorkspace();
		if (!workspace) return;

		const deps = _deps.flat();
		const status = _status ?? 'installing...';

		this._install(workspace, status, deps);
	}

	async remove(_dependency?: Dependency) {
		const dependencies = _dependency ? [_dependency] : this.treeView.selection.filter(isDependency);
		this.treeDataProvider.refresh(true);

		for (const dependency of dependencies) {
			this.dependencies.setStatus(dependency.workspace.path, dependency.name, 'removing...');

			this._executeCommand(`npm remove ${dependency.name}`, { cwd: dependency.workspace.path })
				.catch(() => vscode.window.showErrorMessage(`Uninstallation of module ${dependency.name} did not finish successfully.`))
				.finally(() => {
					this.dependencies.removeStatus(dependency.workspace.path, dependency.name);
					this.treeDataProvider.refresh();
				});
		}
	}

	async update(_dependency?: Dependency) {
		const dependencies = _dependency ? [_dependency] : this.treeView.selection.filter(isDependency);
		
		this.treeDataProvider.refresh(true);

		for (const dependency of dependencies)
			this._install(dependency.workspace.path, 'Updating...', { dev: dependency.dev, rawSep: `${dependency.name}@latest` });
	}
}