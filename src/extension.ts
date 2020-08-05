import * as vscode from 'vscode';
import { Dependencies, Dependency, DependencyTreeProvider, WorkspaceItem } from './dependencies';
import * as childProcess from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import utils from './utils';
import console, { Console } from './console';
import { Writable } from 'stream';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('Node Dependencies');
	Console.output = output;

	const dependencies = new Dependencies();
	const treeDataProvider = new DependencyTreeProvider(dependencies);

	vscode.window.createTreeView('nodeDependencies', { treeDataProvider, showCollapseAll: true, canSelectMany: false });
	vscode.commands.registerCommand('nodeDependencies.refreshDependency', () => treeDataProvider.refresh());
	vscode.commands.registerCommand('nodeDependencies.npmopen', (node: Dependency) => opennpm(node.name, node.version));
	vscode.commands.registerCommand('nodeDependencies.addDependency', async (node: WorkspaceItem | undefined) => addDependency(node?.path, false));
	vscode.commands.registerCommand('nodeDependencies.addDevDependency', async (node: WorkspaceItem | undefined) => addDependency(node?.path, true));
	vscode.commands.registerCommand('nodeDependencies.editDependency', (node: Dependency) => editVersion(node));
	vscode.commands.registerCommand('nodeDependencies.deleteDependency', (node: Dependency) => remove(node));
	vscode.commands.registerCommand('nodeDependencies.updateDependency', (node: Dependency) => editVersion(node, 'latest'));
	vscode.commands.registerCommand('nodeDependencies.init', () => init());

	function opennpm(_package: string, version?: string) {
		let url = `https://www.npmjs.com/package/${_package}`;

		if (version) {
			const match = /([0-9]+\.[0-9]+\.[0-9]+)/.exec(version);

			const _version = match && typeof match[0] === 'string' ? match[0] : undefined;

			if (_version)
				url += `/v/${_version}`;
		}

		vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
	}

	async function executeCommand(command: string, options?: childProcess.ExecOptions & { pipe?: boolean | Writable }): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const subprocess = childProcess.exec(command, options);

			subprocess.on('error', reject);
			subprocess.on('exit', code => {
				if (code !== 0)
					reject(code);

				treeDataProvider.refresh();
				resolve();
			});

			if (options?.pipe !== false) {
				const pipe = options?.pipe instanceof Writable ? options.pipe : console.pipe;

				subprocess.stdout?.pipe(pipe);
				subprocess.stderr?.pipe(pipe);
			}
		});
	}

	async function addDependency(workspace: string | undefined, dev: boolean) {
		workspace = workspace ?? await getWorkspace();
		if (!workspace) return void vscode.window.showWarningMessage('No workspace or folder open');
		const deps = await getModuleNames(true);
		if (!(deps && deps.length)) return;
		install(workspace, undefined, deps);
	}

	async function getWorkspace() {
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

	async function editVersion(dependency: Dependency, _version?: string) {
		const version = _version ?? await vscode.window.showInputBox({ placeHolder: 'Version, e.g. 1.2.3' });
		install(dependency.workspace.path, 'updating...', { dev: dependency.dev, name: `${dependency.name}@${version}` });
	}

	async function init(_workspace?: string, force = false) {
		const workspace = _workspace ?? await getWorkspace();
		if (!workspace) return;

		if (!force && fs.existsSync(path.join(workspace, 'package.json')))
			return;

		await executeCommand('npm init -y', { cwd: workspace }).catch(() => vscode.window.showErrorMessage(`Initialization of project failed.`));
	}

	async function getModuleNames(dev: boolean, value?: string) {
		return (await vscode.window.showInputBox({ value, valueSelection: [999, 999] }))?.split(' ').map(name => ({ name, dev }));
	}

	async function install(_workspace?: string, _status?: string, ..._deps: ({ name: string, dev: boolean } | { name: string, dev: boolean }[])[]) {
		if (_deps.flat().length === 0) return;

		const workspace = _workspace ?? await getWorkspace();
		if (!workspace) return;

		const deps = _deps.flat();
		const status = _status ?? 'installing...';

		for (const dep of deps) {
			dependencies.setStatus(workspace, dep.name.replace(/@.+$/, '').trim(), status, dep.dev);
		}

		treeDataProvider.refresh(true);

		for (const module of deps) {
			await executeCommand(`npm install ${module.name}${typeof module.dev === 'boolean' ? module.dev ? ' --save-dev' : ' --save' : ''}`, { cwd: workspace })
				.catch(() => vscode.window.showErrorMessage(`Installation of module ${module.name} did not finish successfully.`));

			dependencies.removeStatus(workspace, module.name);
			treeDataProvider.refresh();
		}
	}

	async function remove(dependency: Dependency) {
		dependencies.setStatus(dependency.workspace.path, dependency.name, 'removing...');
		treeDataProvider.refresh(true);

		await executeCommand(`npm remove ${dependency.name}`, { cwd: dependency.workspace.path })
			.catch(() => vscode.window.showErrorMessage(`Uninstallation of module ${dependency.name} did not finish successfully.`));

		dependencies.removeStatus(dependency.workspace.path, dependency.name);
		treeDataProvider.refresh();
	}
}
