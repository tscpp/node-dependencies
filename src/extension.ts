import * as vscode from 'vscode';
import { Dependencies, Dependency, DependencyTreeProvider, WorkspaceItem } from './dependencies';
import { Console } from './console';
import Commands from './commands';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('Node Dependencies');
	Console.output = output;

	const dependencies = new Dependencies();
	const treeDataProvider = new DependencyTreeProvider(dependencies);
	const treeView = vscode.window.createTreeView<Dependency | WorkspaceItem>('nodeDependencies', { treeDataProvider, showCollapseAll: true, canSelectMany: true });

	const configFilesVisible = (() => {
		const excludes = vscode.workspace.getConfiguration('files').inspect('exclude')?.globalValue as Record<string, boolean | { when: string }>
		const node_modules = Boolean(Object.keys(excludes).find(key => key === '**/node_modules' && excludes[key] === true))
		const package_lock = Boolean(Object.keys(excludes).find(key => key === '**/package-lock.json' && excludes[key] === true))
		
		return !(node_modules || package_lock)
	})()

	const commands = new Commands(dependencies, treeDataProvider, treeView);
	vscode.commands.registerCommand('nodeDependencies.npmopen', (...args: Parameters<Commands['opennpm']>) => commands.opennpm(...args));
	vscode.commands.registerCommand('nodeDependencies.addDependency', (...args: Parameters<Commands['addDependency']>) => commands.addDependency(...args));
	vscode.commands.registerCommand('nodeDependencies.addDevDependency', (...args: Parameters<Commands['addDevDependency']>) => commands.addDevDependency(...args));
	vscode.commands.registerCommand('nodeDependencies.changeDependencyVersion', (...args: Parameters<Commands['changeDependencyVersion']>) => commands.changeDependencyVersion(...args));
	vscode.commands.registerCommand('nodeDependencies.changeDependencyType', (...args: Parameters<Commands['changeDependencyType']>) => commands.changeDependencyType(...args));
	vscode.commands.registerCommand('nodeDependencies.deleteDependency', (...args: Parameters<Commands['remove']>) => commands.remove(...args));
	vscode.commands.registerCommand('nodeDependencies.updateDependency', (...args: Parameters<Commands['update']>) => commands.update(...args));
	vscode.commands.registerCommand('nodeDependencies.hideConfigFiles', () => {
		vscode.commands.executeCommand('setContext', 'nodeDependencies:configFilesVisible', false);
		commands.hideConfigFiles();
	});
	vscode.commands.registerCommand('nodeDependencies.showConfigFiles', () => {
		vscode.commands.executeCommand('setContext', 'nodeDependencies:configFilesVisible', true);
		commands.showConfigFiles();
	});
	vscode.commands.executeCommand('setContext', 'nodeDependencies:configFilesVisible', configFilesVisible);
	vscode.commands.executeCommand('setContext', 'nodeDependencies:hasSelection', false);
	vscode.commands.executeCommand('setContext', 'nodeDependencies:hasSingleSelection', false);
	treeView.onDidChangeSelection(() => vscode.commands.executeCommand('setContext', 'nodeDependencies:hasSelection', Boolean(treeView.selection)));
	treeView.onDidChangeSelection(() => vscode.commands.executeCommand('setContext', 'nodeDependencies:hasSingleSelection', treeView.selection.length === 1));
}
