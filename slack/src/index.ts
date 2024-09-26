/**
 * The module has useful functions for interacting with Slack
 *
 */
import {
  dag,
  Container,
  Directory,
  File,
  object,
  func,
  Void,
} from "@dagger.io/dagger";

@object()
class Slack {
  /**
   * Send file to Slack
   * @param file File to send
   * @param slackChannelId Slack Channel ID (e.g. C01B2AB3C4D, open properties of the channel and copy the ID from the URL)
   * @param comment Comment to add to the file
   * @param slackToken Slack Token (Bot User OAuth Access Token)
   */
  @func() async sendFile(
    file: File,
    slackChannelId: string,
    comment: string,
    slackToken: string,
  ): Promise<string> {
    const filename = file.name();
    return dag
      .container()
      .from("alpine:latest")
      .withFile(`/${filename}`, file)
      .withExec(["apk", "add", "curl"])
      .withExec([
        "curl",
        "-v",
        "--limit-rate",
        "2M",
        "-F",
        `file=@/${filename}`,
        "-F",
        `channels=${slackChannelId}`,
        "-F",
        `initial_comment=${comment}`,
        "-F",
        `token=${slackToken}`,
        "https://slack.com/api/files.upload",
      ])
      .stdout();
  }
}
