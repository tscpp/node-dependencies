import * as vscode from 'vscode';

export default new class {
	get workspaces() {
		return vscode.workspace.workspaceFolders?.map(workspace => this.uri2Path(workspace.uri)) ?? [];
	}

	uri2Path(uri: string | vscode.Uri): string {
		const path = typeof uri === 'string' ? uri : uri.path;

		return path.replace(/\/([a-zA-Z]):\//, (_, s1) => `${s1}:/`);
	}
};
