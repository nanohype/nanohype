package __JAVA_PKG__.web;

import __JAVA_PKG__.domain.ExampleEntity;
import __JAVA_PKG__.service.ExampleService;
import io.micrometer.core.annotation.Timed;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * HTTP surface for the example resource.
 *
 * <p>The {@code @Timed} name is the metric these endpoints report under; renaming it renames the
 * series, so a dashboard or an alert built on the old name stops matching.
 */
@RestController
@RequestMapping("/api/v1/examples")
@Timed("examples.controller")
public class ExampleController {

  private final ExampleService service;

  /**
   * Binds the controller to its service.
   *
   * @param service the transactional boundary this controller delegates to
   */
  public ExampleController(ExampleService service) {
    this.service = service;
  }

  /**
   * Lists every example.
   *
   * @return every example
   */
  @GetMapping
  public List<ExampleEntity> list() {
    return service.list();
  }

  /**
   * Reads one example.
   *
   * @param id the identifier to look up
   * @return {@code 200} with the example, or {@code 404} when no row carries that id
   */
  @GetMapping("/{id}")
  public ResponseEntity<ExampleEntity> get(@PathVariable Long id) {
    return service
        .find(id)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  /**
   * Creates an example.
   *
   * @param body the name to create under, validated before this method is entered
   * @return {@code 201} with the created example and a {@code Location} naming it
   */
  @PostMapping
  public ResponseEntity<ExampleEntity> create(@Valid @RequestBody CreateRequest body) {
    ExampleEntity created = service.create(body.name());
    return ResponseEntity.created(URI.create("/api/v1/examples/" + created.getId())).body(created);
  }

  /**
   * Deletes an example.
   *
   * @param id the identifier to remove
   * @return {@code 204}, whether or not a row carried that id — the delete is idempotent
   */
  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }

  /**
   * The create request body.
   *
   * @param name the example's name; the constraints are enforced by {@code @Valid} on the handler,
   *     so a violation is a {@code 400} rather than a service-layer exception
   */
  public record CreateRequest(@NotBlank @Size(max = 120) String name) {}
}
