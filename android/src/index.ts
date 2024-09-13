/**
 * A generated module for Android functions
 *
 */
import { dag, Container, Directory, object, func } from "@dagger.io/dagger";

@object()
class Android {
  /**
   * Returns a container for Android build with the provided source directory
   * @param src Source directory of the Android Project
   */
  @func()
  container(src: Directory): Container {
    return dag
      .container()
      .from("digiosysops/android-build:latest")
      .withDirectory("/app", src)
      .withWorkdir("/app");
  }

  /**
   * Returns the compilation file before the build process
   * @param src Source directory of the Android Project
   * @param command Command to run
   * @param exportDirectory Export directory of the build
   */
  @func() gradle(
    src: Directory,
    command: string,
    exportDirectory: string,
  ): Directory {
    const image = this.container(src);
    return image
      .withExec(command.split(" "))
      .directory("/app/" + exportDirectory);
  }
}
