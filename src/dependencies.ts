import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import utils from './utils';

export class Dependencies {
	private customDependencyStatuses: Record<string, Record<string, { status: string, dev?: boolean } | undefined>> = {};

	public setStatus(workspacePath: string, moduleName: string, status: string, dev?: boolean) {
		if (!this.customDependencyStatuses[workspacePath]) this.customDependencyStatuses[workspacePath] = {};
		this.customDependencyStatuses[workspacePath][moduleName] = { status, dev };
	}

	public removeStatus(workspacePath: string, moduleName: string) {
		if (!this.customDependencyStatuses[workspacePath]) return;
		if (!this.customDependencyStatuses[workspacePath][moduleName]) return;
		this.customDependencyStatuses[workspacePath][moduleName] = undefined;
	}
}

export class DependencyTreeProvider implements vscode.TreeDataProvider<Dependency | WorkspaceItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | void> = new vscode.EventEmitter<Dependency | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private dependencies: Dependencies) {
		for (const workspace of utils.workspaces) {
			const packageJsonPath = path.join(workspace, 'package.json');
			if (packageJsonPath)
				fs.watchFile(packageJsonPath, () => this.refresh());
		}
	}

	async refresh(cache = false) {
		if (!cache)
			this.packageCache = {};
		this._onDidChangeTreeData.fire();
	}

	public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	public getChildren(element?: Dependency | WorkspaceItem): Thenable<Dependency[] | WorkspaceItem[]> {
		if (!element && utils.workspaces.length > 1)
			return Promise.resolve(utils.workspaces.map(workspacePath => new WorkspaceItem(workspacePath)));

		const workspace = (element instanceof WorkspaceItem ? element : element?.workspace) ?? (utils.workspaces.length ? new WorkspaceItem(utils.workspaces[0]) : undefined);

		if (!workspace) return Promise.resolve([]);

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
			const customDependencyStatuses = this.dependencies['customDependencyStatuses'][workspace.path] ?? {};

			const toDep = (moduleName: string, version: string, dev: boolean): Dependency => {
				const customStatus = customDependencyStatuses[moduleName];
				dev = customStatus?.dev ? customStatus?.dev : dev;

				if (customStatus)
					customDependencyStatuses[moduleName] = undefined;

				if (this.pathExists(path.join(workspace.path, 'node_modules', moduleName))) {
					const childPackage = this.getPackageJSON(moduleName, workspace);

					const dependencies = [].concat(childPackage?.dependencies, childPackage?.devDependencies).filter(v => v);

					let collapsible = vscode.TreeItemCollapsibleState.Collapsed;

					if (!dependencies.length || dependencies.length <= 1)
						collapsible = vscode.TreeItemCollapsibleState.None;

					return new Dependency(moduleName, collapsible, dev, workspace, version, customStatus?.status);
				} else {
					return new Dependency(moduleName, vscode.TreeItemCollapsibleState.None, dev, workspace, version, customStatus?.status);
				}
			};

			const deps = Object.keys(packageJson?.dependencies ?? {}).map(dep => toDep(dep, packageJson?.dependencies[dep], false));
			const devDeps = Object.keys(packageJson?.devDependencies ?? {}).map(dep => toDep(dep, packageJson?.devDependencies[dep], true));

			const customs: Dependency[] = [];

			if (root) for (const moduleName in customDependencyStatuses)
				if (Object.prototype.hasOwnProperty.call(customDependencyStatuses, moduleName)) {
					const status = customDependencyStatuses[moduleName];
					if (!status) continue;
					customs.push(new Dependency(moduleName, vscode.TreeItemCollapsibleState.None, status.dev ?? false, workspace, undefined, status.status));
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
	constructor(public readonly path: string) {
		super('', vscode.TreeItemCollapsibleState.Collapsed);
	}

	name = this._getName();

	get label() {
		return this._getName();
	}

	set label(v: any) {
		return;
	}

	private _getName() {
		return path.parse(this.path).base.replace(new RegExp('\\' + path.sep, 'g'), '/');
	}

	contextValue = 'workspace';
}

export class Dependency extends vscode.TreeItem {
	constructor(
		public readonly name: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly dev: boolean,
		public readonly workspace: WorkspaceItem,
		private version?: string,
		private status?: string
	) {
		super(name, collapsibleState);

		Object.defineProperty(this, 'description', {
			get: () => {
				if (this.status)
					return this.status;

				if (this.version) {
					return this.versions.join(', ');
				} else {
					return 'unknown';
				}
			}
		})
	}

	tooltip = `${this.name}${this.version ? ` ${this.version}` : ''}`;

	public description: string = '';

	versions = this.version ? this.version.split('||').map(v => v.trim()).map(versionRaw => ({
		prefix: versionRaw.startsWith('^') || versionRaw.startsWith('~') ? versionRaw.slice(0, 1) : '',
		version: versionRaw.startsWith('^') || versionRaw.startsWith('~') ? versionRaw.slice(1) : versionRaw
	})).map(version => `${version.prefix === '~' ? '~' : ''}${version.version}`) : [];

	iconPath = new vscode.ThemeIcon(this.dev ? 'tools' : 'package');

	contextValue = 'dependency';
}
