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
				fs.watchFile(packageJsonPath, () => this.refresh());
		}
	}

	customDependencyStatuses: Record<string, Record<string, { status: string, dev?: boolean } | undefined>> = {};

	public setStatus(workspacePath: string, moduleName: string, status: string, dev?: boolean) {
		if (!this.customDependencyStatuses[workspacePath]) this.customDependencyStatuses[workspacePath] = {};
		this.customDependencyStatuses[workspacePath][moduleName] = { status, dev };
	}

	public removeStatus(workspacePath: string, moduleName: string) {
		if (!this.customDependencyStatuses[workspacePath]) return;
		if (!this.customDependencyStatuses[workspacePath][moduleName]) return;
		this.customDependencyStatuses[workspacePath][moduleName] = undefined;
	}

	async refresh(cache = false) {
		if (!cache)
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
		let root = false;

		if (element instanceof Dependency) {
			packageJsonPath = path.join(workspace.path, 'node_modules', element.name, 'package.json');
		} else {
			root = true;
			packageJsonPath = path.join(workspace.path, 'package.json');
		}

		if (this.pathExists(packageJsonPath)) {
			return Promise.resolve(this.getDepsInPackageJson(workspace, packageJsonPath, root));
		} else {
			return Promise.resolve([]);
		}
	}

	private packageCache: Record<string, string> = {};

	private getPackageJSON(moduleNameOrPath: string, workspace: WorkspaceItem): Record<string, any> | undefined {
		try {
			const _path = path.isAbsolute(moduleNameOrPath) ? moduleNameOrPath : path.join(workspace.path, 'node_modules', moduleNameOrPath, 'package.json');

			const moduleName = path.parse(_path).dir.split(/\\|\//).pop();

			if (!moduleName) return;

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
	private getDepsInPackageJson(workspace: WorkspaceItem, packageJsonPath: string, root: boolean): Dependency[] {
		if (this.pathExists(packageJsonPath)) {
			const packageJson = this.getPackageJSON(packageJsonPath, workspace);
			const customDependencyStatuses = this.customDependencyStatuses[workspace.path] ?? {};

			const toDep = (moduleName: string, version: string, dev: boolean): Dependency => {
				const customStatus = customDependencyStatuses[moduleName];
				const status = customStatus?.status ?? version;
				dev = customStatus?.dev ? customStatus?.dev : dev;

				if (customStatus)
					customDependencyStatuses[moduleName] = undefined;

				if (this.pathExists(path.join(workspace.path, 'node_modules', moduleName))) {
					const childPackage = this.getPackageJSON(moduleName, workspace);

					const dependencies = [].concat(childPackage?.dependencies, childPackage?.devDependencies).filter(v => v);

					let collapsible = vscode.TreeItemCollapsibleState.Collapsed;

					if (!dependencies.length || dependencies.length === 0)
						collapsible = vscode.TreeItemCollapsibleState.None;

					return new Dependency(moduleName, status, collapsible, dev, workspace);
				} else {
					return new Dependency(moduleName, status, vscode.TreeItemCollapsibleState.None, dev, workspace);
				}
			};

			const deps = Object.keys(packageJson?.dependencies ?? {}).map(dep => toDep(dep, packageJson?.dependencies[dep], false));
			const devDeps = Object.keys(packageJson?.devDependencies ?? {}).map(dep => toDep(dep, packageJson?.devDependencies[dep], true));

			const customs: Dependency[] = [];

			if (root) for (const moduleName in customDependencyStatuses)
				if (Object.prototype.hasOwnProperty.call(customDependencyStatuses, moduleName)) {
					const status = customDependencyStatuses[moduleName];
					if (!status) continue;
					customs.push(new Dependency(moduleName, status.status, vscode.TreeItemCollapsibleState.None, status.dev ?? false, workspace));
				}

			return deps.concat(devDeps, customs).sort((a, b) => {
				if (a.name < b.name) return -1;
				if (a.name > b.name) return 1;
				return 0;
			});
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
		this.name = WorkspaceItem.relative(path);
	}

	private static workspaces = vscode.workspace.workspaceFolders?.map(workspace => workspace.uri.path.replace(/\/[a-zA-Z]:\//, '/')) ?? [];

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
