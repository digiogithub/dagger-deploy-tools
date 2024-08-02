import { dag, Container, File, Directory, object, func } from "@dagger.io/dagger"

@object()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class NodeTools {

  

  /**
   * Build for production using node of file in source directory .node-version
   */
  @func()
  buildBackend(source: Directory): Directory {
    const nodeVersion = "20.9.0"
    const nodeCache = dag.cacheVolume("node")

    return dag
      .container()
      .from(`node:${nodeVersion}-slim`)
      .withDirectory("/src", source)
      .withMountedCache("/src/node_modules", nodeCache)
      .withWorkdir("/src")
      .withExec(["npm", "install"])
      .withExec(["npm", "run", "build:prod"])
      .directory("/src/dist")
  }

  /**
   * Zip the build directory
   */
  @func()
  archiveBackend(build: Directory): File {
    return dag
      .archivist()
      .tarGz()
      .archive("archive", build)
  }

  /**
   * Exports the build directory as zip file
   */
  @func()
  exportTgz(source: Directory): File {
    const build = this.buildBackend(source)

    return this.archiveBackend(build)
  }
}
