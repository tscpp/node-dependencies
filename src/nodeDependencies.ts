import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class DepNodeProvider implements vscode.TreeDataProvider<Dependency | WorkspaceItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | void> = new vscode.EventEmitter<Dependency | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | void> = this._onDidChangeTreeData.event;

	private workspacePaths = this.workspaces.map(workspace => workspace.uri.path.replace(/\/[a-zA-Z]:\//, '/'));

	constructor(private workspaces: readonly vscode.WorkspaceFolder[]) {
		for (const workspace of this.workspacePaths) {
			const packageJsonPath = path.join(workspace, 'package.json');
			if (packageJsonPath)
				fs.watchFile(packageJsonPath, this.refresh);
		}
	}

	async refresh() {
		this.packageCache = {};
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Dependency | WorkspaceItem): Thenable<Dependency[] | WorkspaceItem[]> {
		if (!element && this.workspacePaths.length > 1)
			return Promise.resolve(this.workspacePaths.map(workspacePath => new WorkspaceItem(workspacePath)));

		const workspace = (element instanceof WorkspaceItem ? element : element?.workspace) ?? new WorkspaceItem(this.workspacePaths[0]);
		let packageJsonPath: string;

		if (element instanceof Dependency) {
			packageJsonPath = path.join(workspace.path, 'node_modules', element.name, 'package.json');
		} else {
			packageJsonPath = path.join(workspace.path, 'package.json');
		}

		if (this.pathExists(packageJsonPath)) {
			return Promise.resolve(this.getDepsInPackageJson(workspace, packageJsonPath));
		} else {
			return Promise.resolve([]);
		}
	}

	private packageCache: Record<string, string> = {};

	private getPackageJSON(moduleNameOrPath: string, workspace: WorkspaceItem): Record<string, any> | undefined {
		try {
			const _path = path.isAbsolute(moduleNameOrPath) ? moduleNameOrPath : path.join(workspace.path, 'node_modules', moduleNameOrPath, 'package.json');

			const moduleName = path.parse(_path).dir.split(/\\|\//).pop();

			let data: string;

			const cache: string | undefined = this.packageCache[moduleName];

			if (cache) {
				data = cache;
			} else {
				data = fs.readFileSync(_path, 'utf-8');

				this.packageCache[moduleName] = data;
			}

			return JSON.parse(data);
		} catch {
			return undefined;
		}
	}

	/**
	 * Given the path to package.json, read all its dependencies and devDependencies.
	 */
	private getDepsInPackageJson(workspace: WorkspaceItem, packageJsonPath: string): Dependency[] {
		if (this.pathExists(packageJsonPath)) {
			const packageJson = this.getPackageJSON(packageJsonPath, workspace);

			const toDep = (moduleName: string, version: string, dev: boolean): Dependency => {
				if (this.pathExists(path.join(workspace.path, 'node_modules', moduleName))) {
					const childPackage = this.getPackageJSON(moduleName, workspace);

					const dependencies = [].concat(childPackage.dependencies, childPackage.devDependencies).filter(v => v);

					let collapsible = vscode.TreeItemCollapsibleState.Collapsed;

					if (!dependencies.length || dependencies.length === 0)
						collapsible = vscode.TreeItemCollapsibleState.None;

					return new Dependency(moduleName, version, collapsible, dev, workspace);
				} else {
					return new Dependency(moduleName, version, vscode.TreeItemCollapsibleState.None, dev, workspace);
				}
			};

			const deps = packageJson.dependencies
				? Object.keys(packageJson.dependencies).map(dep => toDep(dep, packageJson.dependencies[dep], false))
				: [];
			const devDeps = packageJson.devDependencies
				? Object.keys(packageJson.devDependencies).map(dep => toDep(dep, packageJson.devDependencies[dep], true))
				: [];
			return deps.concat(devDeps);
		} else {
			return [];
		}
	}

	private pathExists(p: string): boolean {
		try {
			fs.accessSync(p);
		} catch (err) {
			return false;
		}

		return true;
	}
}

export class WorkspaceItem extends vscode.TreeItem {
	public readonly name: string;

	constructor(public readonly path: string) {
		super(WorkspaceItem.relative(path), vscode.TreeItemCollapsibleState.Collapsed);
	}

	private static workspaces = vscode.workspace.workspaceFolders.map(workspace => workspace.uri.path.replace(/\/[a-zA-Z]:\//, '/'));
	
	private static relative(mainPath: string) {
		const paths = this.workspaces.filter(path => path !== mainPath);

		let result = mainPath;

		if (paths.length === 0) return path.parse(mainPath).base;

		for (const _path of paths) {
			if (_path === mainPath) continue;
			result = path.relative(_path, result);
		}

		return result;
	}
}

export class Dependency extends vscode.TreeItem {
	constructor(
		public readonly name: string,
		private version: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly dev: boolean,
		public readonly workspace: WorkspaceItem
	) {
		super(name, collapsibleState);
	}

	get tooltip(): string {
		return `${this.name} ${this.version}`;
	}

	get description(): string {
		const versions: { prefix: string, version: string }[] = [];

		for (const versionRaw of this.version.split('||').map(v => v.trim())) {
			versions.push({
				prefix: versionRaw.startsWith('^') || versionRaw.startsWith('~') ? versionRaw.slice(0, 1) : '',
				version: versionRaw.startsWith('^') || versionRaw.startsWith('~') ? versionRaw.slice(1) : versionRaw
			});
		}

		return versions.map(version => `${version.prefix === '~' ? '~' : ''}${version.version}`).join(', ');
	}

	iconPath = new vscode.ThemeIcon(this.dev ? 'tools' : 'package');

	contextValue = 'dependency';
}
