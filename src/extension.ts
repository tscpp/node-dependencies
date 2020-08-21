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

	const commands = new Commands(dependencies, treeDataProvider, treeView);
	vscode.commands.registerCommand('nodeDependencies.npmopen', (...args: Parameters<Commands['opennpm']>) => commands.opennpm(...args));
	vscode.commands.registerCommand('nodeDependencies.addDependency', (...args: Parameters<Commands['addDependency']>) => commands.addDependency(...args));
	vscode.commands.registerCommand('nodeDependencies.addDevDependency', (...args: Parameters<Commands['addDevDependency']>) => commands.addDevDependency(...args));
	vscode.commands.registerCommand('nodeDependencies.changeDependencyVersion', (...args: Parameters<Commands['changeDependencyVersion']>) => commands.changeDependencyVersion(...args));
	vscode.commands.registerCommand('nodeDependencies.changeDependencyType', (...args: Parameters<Commands['changeDependencyType']>) => commands.changeDependencyType(...args));
	vscode.commands.registerCommand('nodeDependencies.deleteDependency', (...args: Parameters<Commands['remove']>) => commands.remove(...args));
	vscode.commands.registerCommand('nodeDependencies.updateDependency', (...args: Parameters<Commands['update']>) => commands.update(...args));
	vscode.commands.executeCommand('setContext', 'nodeDependencies:hasSelection', false);
	vscode.commands.executeCommand('setContext', 'nodeDependencies:hasSingleSelection', false);
	treeView.onDidChangeSelection(() => vscode.commands.executeCommand('setContext', 'nodeDependencies:hasSelection', Boolean(treeView.selection)));
	treeView.onDidChangeSelection(() => vscode.commands.executeCommand('setContext', 'nodeDependencies:hasSingleSelection', treeView.selection.length === 1));
}
