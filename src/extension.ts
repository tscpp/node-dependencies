import * as vscode from 'vscode';
import { DepNodeProvider, Dependency } from './nodeDependencies';
import * as childProcess from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
	const treeDataProvider = new DepNodeProvider(vscode.workspace.workspaceFolders ?? []);
	vscode.window.createTreeView('nodeDependencies', { treeDataProvider, showCollapseAll: true, canSelectMany: false });
	vscode.commands.registerCommand('nodeDependencies.refreshDependency', () => treeDataProvider.refresh());
	vscode.commands.registerCommand('nodeDependencies.npmopen', (node: Dependency) => vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(`https://www.npmjs.com/package/${node.name}`)));
	vscode.commands.registerCommand('nodeDependencies.addDependency', () => ask_install(false));
	vscode.commands.registerCommand('nodeDependencies.addDevDependency', () => ask_install(true));
	vscode.commands.registerCommand('nodeDependencies.editDependency', (node: Dependency) => ask_install(undefined, node.name + '@'));
	vscode.commands.registerCommand('nodeDependencies.deleteDependency', (node: Dependency) => remove(node));
	vscode.commands.registerCommand('nodeDependencies.updateDependency', (node: Dependency) => install(node.workspace.path, [node.name + '@latest'], 'updating...', node.dev));
	vscode.commands.registerCommand('nodeDependencies.init', () => init());

	async function init() {
		const workspacePaths = vscode.workspace.workspaceFolders?.map(folder => folder.uri.path).map(path => path.replace(/\/[a-zA-Z]:\//, '/')) ?? [];

		let workspace: string | undefined;

		if (workspacePaths.length === 1)
			workspace = workspacePaths[0];
		else
			workspace = (await vscode.window.showWorkspaceFolderPick())?.uri.path.replace(/\/[a-zA-Z]:\//, '/');

		if (!workspace) return;

		const cwd = workspace;

		if (fs.existsSync(path.join(workspace, 'package.json')))
			return vscode.window.showInformationMessage('The project is already initialized.');

		const child = childProcess.exec(`npm init -y`, { cwd });

		child.on('error', err => { throw err; });
		child.on('exit', code => {
			if (code !== 0)
				vscode.window.showErrorMessage(`Initialization of project failed.`);

			treeDataProvider.refresh();
			vscode.workspace.openTextDocument(path.join(cwd, 'package.json'));
		});
	}

	async function ask_install(dev?: boolean, prefix?: string) {
		const workspacePaths = vscode.workspace.workspaceFolders?.map(folder => folder.uri.path).map(path => path.replace(/\/[a-zA-Z]:\//, '/')) ?? [];

		let workspace: string | undefined;

		if (workspacePaths.length === 1)
			workspace = workspacePaths[0];
		else
			workspace = (await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Workspace to install the dependency in' }))?.uri.path.replace(/\/[a-zA-Z]:\//, '/');

		if (!workspace) return;

		if (!fs.existsSync(path.join(workspace, 'package.json')))
			await init();

		const moduleNames = (await vscode.window.showInputBox({ value: prefix, valueSelection: [999, 999] }))?.split(' ');

		if (!moduleNames) return;

		install(workspace, moduleNames, 'installing...', dev);
	}

	function install(workspace: string, moduleNames: string[], status: string, dev?: boolean) {
		for (const moduleName of moduleNames) {
			treeDataProvider.setStatus(workspace, moduleName.replace(/@.+$/, '').trim(), status, dev);
		}

		treeDataProvider.refresh();

		for (const moduleName of moduleNames) {
			const child = childProcess.exec(`npm install ${moduleName}${typeof dev === 'boolean' ? dev ? ' --save-dev' : ' --save' : ''}`, { cwd: workspace });

			child.on('error', err => { throw err; });
			child.on('exit', code => {
				if (code !== 0)
					vscode.window.showErrorMessage(`Installation of module ${moduleName} did not finish successfully.`);

				treeDataProvider.removeStatus(workspace, moduleName);
				treeDataProvider.refresh();
			});
		}
	}

	async function remove(dependency: Dependency) {
		const child = childProcess.exec(`npm remove ${dependency.name}`, { cwd: dependency.workspace.path });

		treeDataProvider.setStatus(dependency.workspace.path, dependency.name, 'removing...');
		treeDataProvider.refresh();

		child.on('error', err => { throw err; });
		child.on('exit', code => {
			if (code !== 0)
				vscode.window.showErrorMessage(`Uninstallation of module ${dependency.name} did not finish successfully.`);

			treeDataProvider.removeStatus(dependency.workspace.path, dependency.name);
			treeDataProvider.refresh();
		});
	}
}
