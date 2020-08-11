# Node Dependencies
**Tree view of all dependencies installed in workspace.** Node Dependencies is an extension for [visual studio code](https://code.visualstudio.com/) or [VS Code for short](https://code.visualstudio.com/), it manages dependencies and displays them in a tree view. The tree view will automatically update the tree view.

### Table of Contents
- [Dependency](#dependency)
- [Dev dependency](#dev-dependency)
- [Installing dependencies](#installing-dependencies)
- [Installing dev dependencies](#installing-dev-dependencies)
- [Editing dependencies](#editing-dependencies)
- [Updating dependencies](#updating-dependencies)
- [Deleting dependencies](#deleting-dependencies)
- [Visiting depedencies in NPM](#visiting-depedencies-in-npm)

## Dependency
A dependency is a package the software relies on. Packages can be found GitHub and other websites. Taking care of packages and version by your self can be extremly hard or impossible. Therefore package managers exists, they take care of installing the packages for you. This extension is based on the package manager [node package manager](https://npmjs.com/) or [npm](https://npmjs.com/) for short.

### Dev dependency
Read [dependency](#dependency) before continuing. A dev dependency is a package only used for development (not used in production). Examples of this is compiler used for compiling the pruduction code.

## Installing dependencies
Read [dependency](#dependency) before continuing. Dependencies can be installed from [npm](https://www.npmjs.com/). Using the plus icon on the view's title will take you trough the steps of installing a dependency. A input box will show up in window asking for depencency names. The extension will now install the dependency.

![](./assets/installing-dependencies01.png)

### Installing dev dependencies
Read [dev dependency](#dev-dependency) and [installing dependencies](#installing-dependencies) before continuing. Using the menu icon on the view's title and choosing 'Add Dev Dependency' from the dropdown list will take you through the steps of installing a dev dependency. The extension will now install the dev dependency.

![](./assets/installing-dev-dependencies01.png)

### Installing dependencies in workspace
Using the plus icon on a workspace item will take you trough the steps of installing a dependency. A input box will show up in window asking for depencency names. The extension will now install the dependency.

![](./assets/installing-dependencies-in-workspace01.png)
![](./assets/installing-dependencies-in-workspace02.png)

### Installing dev dependencies in workspace
Using right-click on a workspace item and choosing 'Install Dev Dependency' in the dropdown list will take you through the steps of installing a dev dependency. A input box will show up in window asking for depencency names. The extension will now install the dependency.

![](./assets/installing-dev-dependencies-in-workspace01.png)

## Editing dependencies
Read [installing dependencies](#installing-dependencies) before continuing. Using right-click on a dependency item and choosing 'Edit' will take you through the steps of editing the dependency. The extension will now edit the dependency with the options provided.

![](./assets/editing-dependencies01.png)

### Updating dependencies
Read [editing dependencies](#editing-dependencies) before continuing. Using right-click on a dependency item and choosing 'Update' will update the dependency to the latest **master** version.

![](./assets/updating-dependencies01.png)

### Deleting dependencies
Read [updating dependencies](#updating-dependencies) before continuing. Using the delete icon on a dependency item will uninstall the dependency in the current workspace.

![](./assets/deleting-dependencies01.png)

## Visiting depedencies in NPM
Read [installing dependencies](#installing-dependencies) before continuing. Using the visit icon or right-click on a dependency item will take you to the package's NPM page.

![](./assets/visiting-dependencies-in-npm01.png)
