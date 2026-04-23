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

@RestController
@RequestMapping("/api/v1/examples")
@Timed("examples.controller")
public class ExampleController {

    private final ExampleService service;

    public ExampleController(ExampleService service) {
        this.service = service;
    }

    @GetMapping
    public List<ExampleEntity> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public ResponseEntity<ExampleEntity> get(@PathVariable Long id) {
        return service.find(id)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<ExampleEntity> create(@Valid @RequestBody CreateRequest body) {
        ExampleEntity created = service.create(body.name());
        return ResponseEntity.created(URI.create("/api/v1/examples/" + created.getId())).body(created);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    public record CreateRequest(@NotBlank @Size(max = 120) String name) {}
}
